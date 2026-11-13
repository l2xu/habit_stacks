/**
 * Höhenschichten der Welt (Wiese → Vögel → Wolken → Himmel → Sterne). Sie liegen fest im Himmel über
 * der Insel – Startseite und Fokus-Modus zeigen dieselbe Welt, nur die Kamera fährt am Turm hoch.
 *
 * Höhe (`alt`) = Bildschirm-Weltpixel über der Grundlinie y = 0 (Fuß des ersten Turms), also −y.
 * Türme weiter hinten stehen etwas höher; ihre Blöcke erreichen die Schichten entsprechend früher.
 */
export interface AltitudeZone {
  id: 'meadow' | 'birds' | 'clouds' | 'sky' | 'stars'
  label: string
  /** Ab dieser Höhe beginnt die Zone. */
  alt: number
  rulerColor: string
}

export const ALTITUDE_ZONES: AltitudeZone[] = [
  { id: 'meadow', label: 'Wiese', alt: 0, rulerColor: '#a9bb7e' },
  { id: 'birds', label: 'Vögel', alt: 150, rulerColor: '#c8d3a6' },
  { id: 'clouds', label: 'Wolken', alt: 280, rulerColor: '#dfe6e3' },
  { id: 'sky', label: 'Himmel', alt: 440, rulerColor: '#b9ced8' },
  { id: 'stars', label: 'Sterne', alt: 620, rulerColor: '#8a90b4' },
]

/** Wo im Himmel was lebt (Höhe in Weltpixeln). */
export const SKY_LAYERS = {
  birds: { from: 165, to: 245 },
  clouds: { from: 290, to: 420 },
  stars: { from: 620, to: 2200 },
  moon: 1080,
} as const

export const MAX_RULER_LEVEL = 12

/** Auf welcher Block-Ebene (gebrochen) liegt die Höhe z? Anker 68 Weltpixel hoch, jeder weitere Block 50. */
export const zToLevel = (z: number) => (z <= 0 ? 0 : z < 68 ? z / 68 : 1 + (z - 68) / 50)

export function zoneForAlt(alt: number): AltitudeZone {
  return ALTITUDE_ZONES.findLast((zone) => alt >= zone.alt) ?? ALTITUDE_ZONES[0]!
}

/**
 * Himmelsfarbe nach Höhe – vom Dunst am Horizont über Hellblau in die Dämmerung, Nacht erst weit oben.
 * Die Übersicht (Zoom 0,46) reicht bis etwa 1000 px: oben dämmrig mit ersten Sternen, nie ganz dunkel.
 */
export const SKY_STOPS: { alt: number; color: string }[] = [
  { alt: 0, color: '#e6ebda' },
  { alt: 260, color: '#dfe8e2' },
  { alt: 430, color: '#cadde6' },
  { alt: 650, color: '#aebcd6' },
  { alt: 900, color: '#8d98bd' },
  { alt: 1150, color: '#656d98' },
  { alt: 1450, color: '#3a3d60' },
  { alt: 1700, color: '#2a2c4a' },
]
