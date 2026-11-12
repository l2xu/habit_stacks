import { audioContext, audioRunning, describeOnLockScreen, noiseBuffer } from './audio'

/**
 * Naturgeräusche, komplett synthetisch (keine Audiodateien):
 * - Wind und leise Brandung laufen immer, in langsamen Böen.
 * - Tagsüber (6–19 Uhr) zwitschern ab und zu Vögel, abends und nachts zirpen Grillen.
 * Start sobald der Ton läuft, gleich hörbar (kurzes lineares Einblenden), Stopp mit weichem Ausblenden.
 */

interface Running {
  master: GainNode
  sources: AudioScheduledSourceNode[]
  timer: number
}

let running: Running | null = null

const FADE_IN = 0.6
const FADE_OUT = 0.6

export function startAmbience() {
  if (running) return
  const c = audioContext()
  if (!c || !audioRunning(c)) return
  describeOnLockScreen()

  const master = c.createGain()
  // Linear statt exponentiell: Exponentiell ab 0 wäre die erste Hälfte praktisch stumm.
  master.gain.setValueAtTime(0, c.currentTime)
  master.gain.linearRampToValueAtTime(1, c.currentTime + FADE_IN)
  master.connect(c.destination)

  const sources: AudioScheduledSourceNode[] = []
  /** Rauschen durch einen Filter, Lautstärke und Filter wandern mit langsamen LFOs. */
  const layer = (filterType: BiquadFilterType, freq: number, q: number, vol: number, swell: number, swellHz: number, sweep: number) => {
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c)
    src.loop = true
    const filter = c.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = freq
    filter.Q.value = q
    const gain = c.createGain()
    gain.gain.value = vol
    const lfo = c.createOscillator()
    lfo.frequency.value = swellHz
    const lfoGain = c.createGain()
    lfoGain.gain.value = swell
    lfo.connect(lfoGain).connect(gain.gain)
    const sweepLfo = c.createOscillator()
    sweepLfo.frequency.value = swellHz * 1.7
    const sweepGain = c.createGain()
    sweepGain.gain.value = sweep
    sweepLfo.connect(sweepGain).connect(filter.frequency)
    src.connect(filter).connect(gain).connect(master)
    src.start(c.currentTime, Math.random() * 2)
    lfo.start()
    sweepLfo.start()
    sources.push(src, lfo, sweepLfo)
  }
  layer('lowpass', 520, 0.7, 0.05, 0.035, 0.07, 260) // Wind in Böen
  layer('bandpass', 380, 0.6, 0.028, 0.022, 0.13, 120) // Brandung, ein Atemzug alle ~8 s

  // Tiere: kleiner Planer, der alle 400 ms entscheidet, ob etwas zu hören ist.
  let nextBird = c.currentTime + 0.5 + Math.random() * 1.5
  const crickets = [
    { freq: 4650, pan: -0.45, next: c.currentTime + 0.4 },
    { freq: 4180, pan: 0.5, next: c.currentTime + 0.9 },
  ]
  const timer = window.setInterval(() => {
    const now = c.currentTime
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 19) {
      if (now >= nextBird) {
        bird(c, master, now + 0.05)
        nextBird = now + 4 + Math.random() * 8
      }
    } else {
      for (const cr of crickets) {
        if (now < cr.next) continue
        chirp(c, master, cr.freq, cr.pan, now + 0.05)
        // Ab und zu eine längere Pause, sonst klingt es mechanisch.
        cr.next = now + 0.8 + Math.random() * 0.5 + (Math.random() < 0.15 ? 2.5 : 0)
      }
    }
  }, 400)

  running = { master, sources, timer }
}

export function stopAmbience() {
  if (!running) return
  const { master, sources, timer } = running
  running = null
  window.clearInterval(timer)
  const c = master.context
  master.gain.cancelScheduledValues(c.currentTime)
  master.gain.setValueAtTime(master.gain.value, c.currentTime)
  master.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + FADE_OUT)
  window.setTimeout(() => {
    sources.forEach((s) => s.stop())
    master.disconnect()
  }, FADE_OUT * 1000 + 100)
}

/** Grillen-Zirpen: drei schnelle Pulse eines hohen Tons. */
function chirp(c: BaseAudioContext, out: AudioNode, freq: number, pan: number, at: number) {
  const panner = c.createStereoPanner()
  panner.pan.value = pan
  panner.connect(out)
  for (let i = 0; i < 3; i++) {
    const t = at + i * 0.045
    const osc = c.createOscillator()
    osc.frequency.value = freq
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.011, t + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028)
    osc.connect(gain).connect(panner)
    osc.start(t)
    osc.stop(t + 0.03)
  }
  window.setTimeout(() => panner.disconnect(), 400)
}

/** Vogel: zwei bis vier kurze, aufsteigende Pfiffe. */
function bird(c: BaseAudioContext, out: AudioNode, at: number) {
  const panner = c.createStereoPanner()
  panner.pan.value = Math.random() * 1.4 - 0.7
  panner.connect(out)
  const base = 2300 + Math.random() * 1200
  const notes = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < notes; i++) {
    const t = at + i * (0.11 + Math.random() * 0.06)
    const sec = 0.06 + Math.random() * 0.05
    const f = base * (1 + (i % 2) * 0.12)
    const osc = c.createOscillator()
    osc.frequency.setValueAtTime(f, t)
    osc.frequency.exponentialRampToValueAtTime(f * 1.3, t + sec)
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.018, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + sec)
    osc.connect(gain).connect(panner)
    osc.start(t)
    osc.stop(t + sec + 0.01)
  }
  window.setTimeout(() => panner.disconnect(), 1200)
}
