import { create } from 'zustand'

/**
 * Web-Push über den eigenen Push-Dienst (`public/push/`, PHP auf dem Webspace). Der Browser kann Nachrichten nicht
 * selbst zu einer Uhrzeit planen – die App schickt deshalb ihren Plan (`plan.ts`) an den Server, ein Cronjob dort
 * verschickt jede Minute, was fällig ist. Lokal: `npm run push:dev` (PHP-Server) + `npm run build && npm run preview`.
 */
export const PUSH_API: string = import.meta.env.VITE_PUSH_API ?? '/push/api.php'

/**
 * Push auf diesem Gerät:
 * - unsupported: Browser kann es nicht (auch: Entwicklungsserver ohne Service Worker)
 * - install:     iPhone/iPad im Browser – erst zum Home-Bildschirm hinzufügen
 * - denied:      im System blockiert
 * - off:         möglich, aber (noch) nicht angemeldet
 * - on:          angemeldet (Abo beim Push-Dienst)
 */
export type PushStatus = 'unsupported' | 'install' | 'denied' | 'off' | 'on'

export function pushStatusText(status: PushStatus | null): string {
  switch (status) {
    case null:
      return 'Wird geprüft …'
    case 'on':
      return 'Auf diesem Gerät aktiv. Der Push-Server kennt dafür nur die geplanten Nachrichten (Turm, Uhrzeit, Text).'
    case 'off':
      return 'Auf diesem Gerät noch nicht angemeldet.'
    case 'install':
      return 'Auf iPhone und iPad kommen Push-Nachrichten nur in der installierten App: Teilen → „Zum Home-Bildschirm“, dann die App von dort öffnen.'
    case 'denied':
      return 'Blockiert. Erlaube Mitteilungen für die App in den Einstellungen des Geräts.'
    case 'unsupported':
      return import.meta.env.DEV
        ? 'Im Entwicklungsserver gibt es keinen Service Worker – zum Testen: npm run build && npm run preview.'
        : 'Dieser Browser kann keine Push-Nachrichten.'
  }
}

/** Fehler lesbar machen – der Name (NotAllowedError, AbortError …) hilft bei der Fehlersuche. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message
  return String(err)
}

const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Registrierung des Service Workers; null, wenn keiner kommt (z. B. `npm run dev`). */
function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs))])
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const own = sub.options.applicationServerKey
  if (!own) return false
  const bytes = new Uint8Array(own)
  return bytes.length === key.length && bytes.every((b, i) => b === key[i])
}

export async function postPush(action: 'sync' | 'unsubscribe' | 'test', body: string, keepalive = false): Promise<void> {
  const res = await fetch(`${PUSH_API}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive })
  if (res.ok) return
  const json = (await res.json().catch(() => null)) as { error?: unknown } | null
  throw new Error(`Push-Server: HTTP ${res.status}${typeof json?.error === 'string' ? ` – ${json.error}` : ''}`)
}

/** `?action=key`: öffentlicher VAPID-Schlüssel (erzeugt der Server beim ersten Aufruf selbst) + letzter Cron-Lauf. */
async function fetchServer(): Promise<{ key: Uint8Array<ArrayBuffer>; cronAt: number | null }> {
  const res = await fetch(`${PUSH_API}?action=key`, { cache: 'no-store' })
  if (!res.headers.get('content-type')?.includes('json')) throw new Error(`HTTP ${res.status}, keine JSON-Antwort – läuft dort PHP?`)
  const json = (await res.json()) as { publicKey?: unknown; cronAt?: unknown; error?: unknown }
  if (!res.ok || typeof json.publicKey !== 'string') throw new Error(`HTTP ${res.status}${typeof json.error === 'string' ? ` – ${json.error}` : ''}`)
  return { key: fromBase64Url(json.publicKey), cronAt: typeof json.cronAt === 'number' ? json.cronAt : null }
}

interface Prepared {
  reg: ServiceWorkerRegistration
  key: Uint8Array<ArrayBuffer>
}

/**
 * Von `refresh()` vorbereitet: Beim Tippen auf „Erlauben“ darf vor `subscribe()` nichts mehr übers Netz. Safari
 * zählt sonst den Tipp nicht mehr als Nutzeraktion und bricht das Abo mit NotAllowedError ab – obwohl erlaubt wurde.
 */
let prepared: Prepared | null = null

const subscribeWith = ({ reg, key }: Prepared) => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })

/** Ein altes Abo mit anderem Server-Schlüssel blockiert ein neues (InvalidStateError): abmelden und noch einmal. */
async function replaceOld(p: Prepared, err: unknown): Promise<PushSubscription> {
  const old = err instanceof DOMException && err.name === 'InvalidStateError' ? await p.reg.pushManager.getSubscription() : null
  if (!old) throw err
  await old.unsubscribe()
  return subscribeWith(p)
}

/** Auf diesem Gerät bewusst abgeschaltet – dann meldet `refresh()` nicht still wieder an. */
const OFF_KEY = 'habit-stacks/push-off'
function setOptedOut(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1')
    else localStorage.removeItem(OFF_KEY)
  } catch {
    // privater Modus o. Ä.: dann eben nur für diese Sitzung
  }
}
function optedOut(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === '1'
  } catch {
    return false
  }
}

type ServerState = { ok: true; cronAt: number | null } | { ok: false; error: string }

interface PushStore {
  /** null, solange geprüft wird. */
  status: PushStatus | null
  /** Aktuelles Abo – synchron greifbar, damit beim Verlassen der App sofort gesendet werden kann. */
  subscription: PushSubscription | null
  busy: boolean
  /** Letzter Fehler beim Anmelden oder beim Senden des Plans – steht zur Fehlersuche in den Einstellungen. */
  error: string | null
  /** Push-Server beim letzten `refresh()`: erreichbar (mit letztem Cron-Lauf) oder Fehlertext; null = ungeprüft. */
  server: ServerState | null
  /** Zuletzt erfolgreich gesendeter Plan (setzt `sync.ts`). */
  synced: { at: number; items: number } | null
  /** Status neu lesen und das Abo vorbereiten (Start, Rückkehr in die App – die Erlaubnis kann sich geändert haben). */
  refresh: () => Promise<void>
  /** Anmelden. Direkt aus einem Tipp heraus aufrufen: `subscribe()` fragt selbst nach der Erlaubnis. */
  enable: () => Promise<PushStatus>
  /** Abo auf diesem Gerät beenden; die Einstellungen der Türme bleiben. */
  disable: () => Promise<void>
  /** Schickt sofort eine Test-Nachricht. */
  test: () => Promise<void>
}

export const usePush = create<PushStore>()((set, get) => ({
  status: null,
  subscription: null,
  busy: false,
  error: null,
  server: null,
  synced: null,

  refresh: async () => {
    if (!canPush()) return set({ status: isIOS() && !isStandalone() ? 'install' : 'unsupported', subscription: null })
    if (Notification.permission === 'denied') return set({ status: 'denied', subscription: null })
    const reg = await registration()
    if (!reg) return set({ status: 'unsupported', subscription: null })
    const key = await fetchServer().then(
      ({ key, cronAt }) => {
        set({ server: { ok: true, cronAt } })
        return key
      },
      (err: unknown) => {
        set({ server: { ok: false, error: describeError(err) } })
        return null
      },
    )
    prepared = key ? { reg, key } : null

    let sub = await reg.pushManager.getSubscription()
    // Erlaubt, aber kein passendes Abo (neuer Server-Schlüssel, abgebrochenes Anmelden): still nachholen.
    if (prepared && Notification.permission === 'granted' && !optedOut() && !(sub && sameKey(sub, prepared.key))) {
      try {
        await sub?.unsubscribe()
        sub = await subscribeWith(prepared)
        set({ error: null })
      } catch (err) {
        sub = await reg.pushManager.getSubscription()
        set({ error: `Anmelden: ${describeError(err)}` })
      }
    }
    set({ status: sub ? 'on' : 'off', subscription: sub })
  },

  enable: async () => {
    if (!canPush()) {
      await get().refresh()
      return get().status ?? 'unsupported'
    }
    // Kein await vor diesen Aufrufen – siehe `prepared`.
    const ready = prepared
    const attempt = ready ? subscribeWith(ready).catch((err: unknown) => replaceOld(ready, err)) : null
    const permission = attempt ? null : Notification.requestPermission()
    setOptedOut(false)
    set({ busy: true, error: null })
    try {
      let sub = attempt ? await attempt : null
      if (!sub) {
        // Push-Server war beim Start nicht erreichbar: erst die Erlaubnis, dann Schlüssel holen und anmelden.
        if ((await permission) !== 'granted') throw new DOMException('Keine Erlaubnis erteilt', 'NotAllowedError')
        await get().refresh()
        const server = get().server
        if (server && !server.ok) throw new Error(`Push-Server nicht erreichbar (${server.error})`)
        sub = get().subscription
        if (!sub) throw new Error(get().error ?? 'Anmelden fehlgeschlagen')
      }
      set({ status: 'on', subscription: sub, error: null })
      return 'on'
    } catch (err) {
      const denied = Notification.permission === 'denied'
      set({ status: denied ? 'denied' : 'off', error: denied ? null : `Anmelden: ${describeError(err).replace(/^Anmelden: /, '')}` })
      return denied ? 'denied' : 'off'
    } finally {
      set({ busy: false })
    }
  },

  disable: async () => {
    const sub = get().subscription
    set({ busy: true })
    try {
      if (sub) {
        await postPush('unsubscribe', JSON.stringify({ endpoint: sub.endpoint })).catch(() => {})
        await sub.unsubscribe()
      }
      setOptedOut(true)
      set({ status: 'off', subscription: null, synced: null })
    } finally {
      set({ busy: false })
    }
  },

  test: async () => {
    const sub = get().subscription
    if (!sub) throw new Error('Kein Abo')
    try {
      await postPush('test', JSON.stringify({ subscription: sub.toJSON() }))
      set({ error: null })
    } catch (err) {
      set({ error: `Test: ${describeError(err)}` })
      throw err
    }
  },
}))
