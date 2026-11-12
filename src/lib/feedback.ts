import { audioContext, audioRunning, noiseBuffer } from './audio'

/** 8-Bit-Töne (Square-Wave) und kurze Effekte. */

type Tune = 'step' | 'skip' | 'timeUp' | 'routine'

const TUNES: Record<Tune, [freq: number, sec: number][]> = {
  step: [[660, 0.07], [990, 0.11]],
  skip: [[392, 0.06], [294, 0.1]],
  timeUp: [[784, 0.09], [988, 0.09], [1319, 0.18]],
  routine: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.22]],
}

export function playFeedback(tune: Tune, { sound }: { sound: boolean }) {
  if (!sound) return
  const c = audioContext()
  if (!c) return
  let t = c.currentTime
  for (const [freq, sec] of TUNES[tune]) {
    tone(c, { freq, at: t, sec, type: 'square', vol: 0.035 })
    t += sec * 0.9
  }
}

// ───────────────────────────── Effekte ─────────────────────────────

export type Sfx = 'tap' | 'open' | 'close' | 'swipe' | 'toggle' | 'land' | 'stone' | 'whoosh' | 'warn' | 'fall' | 'break' | 'solidify'

/**
 * Leise Effekte für Bedienung und Welt. `pitch` verschiebt die Tonhöhe (1 = normal),
 * z. B. höher für weiter oben landende Blöcke.
 */
export function playSfx(name: Sfx, sound: boolean, pitch = 1) {
  if (!sound) return
  const c = audioContext()
  if (!c || !audioRunning(c)) return
  const t = c.currentTime + 0.005
  const p = pitch
  switch (name) {
    case 'tap':
      return tone(c, { freq: 620 * p, to: 760 * p, at: t, sec: 0.05, type: 'triangle', vol: 0.05 })
    case 'open':
      tone(c, { freq: 440 * p, at: t, sec: 0.05, type: 'triangle', vol: 0.045 })
      return tone(c, { freq: 660 * p, at: t + 0.05, sec: 0.07, type: 'triangle', vol: 0.045 })
    case 'close':
      tone(c, { freq: 600 * p, at: t, sec: 0.05, type: 'triangle', vol: 0.04 })
      return tone(c, { freq: 420 * p, at: t + 0.045, sec: 0.07, type: 'triangle', vol: 0.04 })
    case 'swipe':
      return hiss(c, { at: t, sec: 0.16, from: 900, to: 2400, vol: 0.05 })
    case 'toggle':
      return tone(c, { freq: 880 * p, at: t, sec: 0.04, type: 'square', vol: 0.025 })
    case 'land':
      tone(c, { freq: 150 * p, to: 90 * p, at: t, sec: 0.09, type: 'triangle', vol: 0.09 })
      return hiss(c, { at: t, sec: 0.05, from: 1800, to: 600, vol: 0.05 })
    case 'stone':
      return tone(c, { freq: 1180 * p, to: 1500 * p, at: t, sec: 0.06, type: 'square', vol: 0.025 })
    case 'whoosh':
      return hiss(c, { at: t, sec: 0.9, from: 300, to: 2600, vol: 0.09, swell: true })
    case 'warn':
      tone(c, { freq: 330, at: t, sec: 0.12, type: 'square', vol: 0.03 })
      return tone(c, { freq: 262, at: t + 0.14, sec: 0.18, type: 'square', vol: 0.03 })
    case 'fall':
      tone(c, { freq: 520, to: 120, at: t, sec: 0.7, type: 'square', vol: 0.03 })
      return hiss(c, { at: t + 0.7, sec: 0.25, from: 700, to: 200, vol: 0.1 })
    case 'break':
      return hiss(c, { at: t, sec: 0.45, from: 3200, to: 500, vol: 0.12 })
    case 'solidify':
      ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, { freq: f, at: t + i * 0.07, sec: 0.12, type: 'triangle', vol: 0.04 }))
      return
  }
}

interface ToneOpts {
  freq: number
  /** Gleitet bis zu dieser Frequenz. */
  to?: number
  at: number
  sec: number
  type: OscillatorType
  vol: number
}

function tone(c: AudioContext, { freq, to, at, sec, type, vol }: ToneOpts) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + sec)
  gain.gain.setValueAtTime(vol, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + sec)
  osc.connect(gain).connect(c.destination)
  osc.start(at)
  osc.stop(at + sec)
}

/** Gefiltertes Rauschen mit wanderndem Filter – Wusch, Splittern, Rumpeln. */
function hiss(c: AudioContext, { at, sec, from, to, vol, swell = false }: { at: number; sec: number; from: number; to: number; vol: number; swell?: boolean }) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(from, at)
  filter.frequency.exponentialRampToValueAtTime(to, at + sec)
  const gain = c.createGain()
  gain.gain.setValueAtTime(swell ? 0.0001 : vol, at)
  if (swell) gain.gain.exponentialRampToValueAtTime(vol, at + sec * 0.4)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + sec)
  src.connect(filter).connect(gain).connect(c.destination)
  src.start(at, Math.random())
  src.stop(at + sec)
}
