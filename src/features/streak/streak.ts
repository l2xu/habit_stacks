/** „6 Tage am Stück“ – für Fließtext, z. B. die Zusammenfassung im Fokus-Modus. */
export const streakLabel = (n: number) => (n === 0 ? 'Noch kein Streak' : n === 1 ? '1 Tag am Stück' : `${n} Tage am Stück`)

/** „6-Tage-Streak“ – Leiste unten in der Detailansicht und Titel im Streak-Overlay. */
export const streakTitle = (n: number) => (n === 0 ? 'Noch kein Streak' : n === 1 ? '1-Tag-Streak' : `${n}-Tage-Streak`)

export const daysLabel = (n: number) => (n === 1 ? '1 Tag' : `${n} Tage`)
