import { describe, expect, it } from 'vitest'
import { DECOR_LOOPS } from '../Decor'
import { drift, twinkle } from '../Sky'
import { keyTrack, loop, springTrack } from './runtime'

describe('Dauer-Animationen im Canvas (wie die Web Animations von `Loop`)', () => {
  it('Drift: lineare Bewegung, Phase über negative Verzögerung', () => {
    const l = loop(drift(1000, 100, 0.25))
    expect(l.at(0).x).toBeCloseTo(250)
    expect(l.at(50_000).x).toBeCloseTo(750)
    // Nach einer Runde wieder von vorn
    expect(l.at(100_000).x).toBeCloseTo(250)
  })

  it('Funkeln: easeInOut über drei Werte, Phase auf der Zeitachse des Dokuments', () => {
    const l = loop(twinkle(0.9))
    expect(l.at(900).opacity).toBeCloseTo(0.3)
    expect(l.at(900 + 1300).opacity).toBeCloseTo(1)
    // easeInOut: nach einem Viertel der Strecke erst ein kleiner Teil des Wegs
    const quarter = l.at(900 + 325).opacity!
    expect(quarter).toBeGreaterThan(0.3)
    expect(quarter).toBeLessThan(0.3 + 0.7 * 0.25)
  })

  it('Pause nach dem Durchlauf: der letzte Wert bleibt stehen (Frosch)', () => {
    const l = loop(DECOR_LOOPS.frog)
    const jumpTop = 0.45 * 550
    expect(l.at(jumpTop).y).toBeCloseTo(-12)
    expect(l.at(1000).y).toBeCloseTo(0)
    expect(l.at(4000).y).toBeCloseTo(0)
    // Nächster Sprung nach Dauer + Pause
    expect(l.at(5050 + jumpTop).y).toBeCloseTo(-12)
  })
})

describe('Einmalige Bewegungen', () => {
  it('Keyframes: Startwert während der Verzögerung, Endwert danach', () => {
    const t = keyTrack([0, 34, 100], { duration: 1, times: [0, 0.5, 1], ease: 'easeIn', delay: 0.5 })
    expect(t.at(0)).toBe(0)
    expect(t.at(500)).toBe(0)
    expect(t.at(1000)).toBeCloseTo(34)
    expect(t.at(1500)).toBe(100)
    expect(t.end).toBe(1500)
  })

  it('Feder: startet nach der Verzögerung, schwingt über und kommt zur Ruhe', () => {
    const t = springTrack(-90, 0, { stiffness: 380, damping: 22, delay: 0.45 })
    expect(t.at(0)).toBe(-90)
    expect(t.at(450)).toBe(-90)
    const samples = Array.from({ length: 60 }, (_, i) => t.at(450 + i * 16))
    expect(Math.max(...samples)).toBeGreaterThan(0)
    expect(t.end).toBeGreaterThan(450)
    expect(t.end).toBeLessThan(3000)
    expect(t.at(t.end)).toBe(0)
  })
})
