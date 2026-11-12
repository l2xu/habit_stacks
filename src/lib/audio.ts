/** Ein gemeinsamer AudioContext für Effekte und Naturgeräusche. Manche Browser (iOS) starten ihn erst nach einer Berührung. */

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

/** Holt (und weckt) den AudioContext; null, wenn kein Web Audio verfügbar ist. */
export function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext()
      describeOnLockScreen()
    }
    // iOS kennt außer „suspended“ noch „interrupted“ (Anruf, Hintergrund).
    if (ctx.state !== 'running') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** App-Icon in mehreren Größen – iOS zeigt große Bilder auf dem Sperrbildschirm oft nicht an. */
const ARTWORK = [
  { src: 'apple-touch-icon.png', sizes: '180x180' },
  { src: 'icon-192.png', sizes: '192x192' },
  { src: 'icon-512.png', sizes: '512x512' },
]

/**
 * Sobald Ton läuft, zeigt iOS eine „Wird gespielt“-Kachel auf dem Sperrbildschirm – mit Titel und Bild statt leer.
 * Wird bei jedem Start der Naturgeräusche erneut gesetzt, weil iOS die Angaben beim Abspielen übernimmt.
 */
export function describeOnLockScreen() {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Habit Stacks',
    artist: 'Naturgeräusche',
    artwork: ARTWORK.map((a) => ({ ...a, src: new URL(a.src, document.baseURI).href, type: 'image/png' })),
  })
}

/** Läuft der Ton schon? Vor der ersten Berührung geplante Töne kämen sonst gesammelt zu spät. */
export const audioRunning = (c: AudioContext) => c.state === 'running'

/** Welches Ereignis als Berührung zählt, hängt von Browser und iOS-Version ab – das erste passende weckt den Ton. */
const GESTURES = ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'click', 'keydown'] as const

/**
 * Weckt den Ton so früh wie möglich und hält ihn wach: sofort beim Start, wo der Browser das erlaubt
 * (installierte App auf Android und Desktop), sonst bei der allerersten Berührung irgendwo – auch auf dem
 * Startbild. iOS verlangt diese eine Berührung immer. Kommt die App aus dem Hintergrund, läuft er wieder an.
 * Gibt eine Aufräumfunktion zurück.
 */
export function wakeAudio(): () => void {
  const c = audioContext()
  if (!c) return () => {}
  const wake = () => {
    if (document.visibilityState === 'visible' && !audioRunning(c)) void c.resume()
  }
  for (const e of GESTURES) window.addEventListener(e, wake, { capture: true, passive: true })
  document.addEventListener('visibilitychange', wake)
  return () => {
    for (const e of GESTURES) window.removeEventListener(e, wake, { capture: true })
    document.removeEventListener('visibilitychange', wake)
  }
}

/** Zwei Sekunden braunes Rauschen (weich, tief) als Schleife für Wind und Brandung. */
export function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise
  const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  noise = buffer
  return buffer
}
