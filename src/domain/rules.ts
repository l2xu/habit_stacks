import type { AppSettings, RulesConfig } from './types'

/** Spielregeln – Überblick: README.md, Abschnitt „Spielregeln in Kürze“. */
export const DEFAULT_RULES: RulesConfig = {
  // 27 Würfel füllen den Geist, der 28. erledigte Tag macht ihn fest.
  formationDays: 28,
  formationGraceDays: 1,
  // Jeder Tag ohne Häkchen zählt: nach 2 Tagen bröckelt ein fester Block, nach 4 fällt er ab.
  skip: { crumbleAfter: 2, fallAfter: 4 },
  maxFormingPerTower: 1,
  restackHeadStart: 18,
}

export const DEFAULT_SETTINGS: AppSettings = {
  dayStartsAtHour: 4,
  sound: true,
  ambience: true,
}
