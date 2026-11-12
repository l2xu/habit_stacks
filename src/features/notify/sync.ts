import { currentDay } from '@/domain/dates'
import { pickDomain } from '@/domain/state'
import { useAppStore } from '@/store/useAppStore'
import { planPushes } from './plan'
import { describeError, postPush, usePush } from './push'

const SYNC_DELAY_MS = 1500

/**
 * Hält den Plan auf dem Push-Server aktuell: nach jeder Änderung an Türmen, Blöcken, Logs oder Einstellungen
 * (entprellt), beim Zurückkehren in die App und sofort, wenn sie in den Hintergrund geht – dort mit `keepalive`,
 * damit das letzte Häkchen noch ankommt. Ohne Abo passiert nichts. Wird einmal beim Start aufgerufen.
 */
export function startPushSync(): void {
  // Zuletzt erfolgreich gesendeter Plan; ein unveränderter Plan geht nicht nochmal raus.
  let lastSent = ''
  let timer: number | undefined

  const run = (keepalive = false) => {
    window.clearTimeout(timer)
    timer = undefined
    const app = useAppStore.getState()
    const sub = usePush.getState().subscription
    if (!app.ui.hydrated || !sub) return
    const domain = pickDomain(app)
    const today = currentDay(domain.settings.dayStartsAtHour, domain.settings.devDayOffset)
    const items = planPushes(domain, today, Date.now())
    const plan = JSON.stringify([sub.endpoint, items])
    if (plan === lastSent) return
    // `stamp`: Kommen zwei Pläne vertauscht an, behält der Server den neueren.
    const body = JSON.stringify({ subscription: sub.toJSON(), items, stamp: Date.now() })
    postPush('sync', body, keepalive).then(
      () => {
        lastSent = plan
        usePush.setState({ synced: { at: Date.now(), items: items.length }, error: null })
      },
      // Offline oder Server-Fehler – beim nächsten Anlass erneut; bis dahin steht der Fehler in den Einstellungen.
      (err: unknown) => usePush.setState({ error: `Plan senden: ${describeError(err)}` }),
    )
  }
  const schedule = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(run, SYNC_DELAY_MS)
  }

  useAppStore.subscribe((s, prev) => {
    if (
      s.ui.hydrated !== prev.ui.hydrated ||
      s.towers !== prev.towers ||
      s.towerOrder !== prev.towerOrder ||
      s.habits !== prev.habits ||
      s.logs !== prev.logs ||
      s.settings !== prev.settings
    )
      schedule()
  })
  usePush.subscribe((s, prev) => s.subscription !== prev.subscription && run())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') return run(true)
    void usePush.getState().refresh()
    schedule()
  })
  void usePush.getState().refresh()
}
