import type { ISODate } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Heutiger Kalendertag unter Berücksichtigung einer verschobenen Tagesgrenze (z. B. 4 Uhr). */
export function todayISO(dayStartsAtHour: number, now = new Date()): ISODate {
  const shifted = new Date(now.getTime() - dayStartsAtHour * 3_600_000)
  return toISODate(shifted)
}

/** "Heute" der App: Tagesgrenze + optionaler Dev-Versatz (Zeitreise). */
export function currentDay(dayStartsAtHour: number, offsetDays = 0, now = new Date()): ISODate {
  return addDays(todayISO(dayStartsAtHour, now), offsetDays)
}

// Rechnen über UTC-Mitternacht, damit Sommer-/Winterzeit keine Tage verschluckt.
function toUTCDays(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function addDays(date: ISODate, n: number): ISODate {
  const t = new Date((toUTCDays(date) + n) * 86_400_000)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** a − b in Tagen. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round(toUTCDays(a) - toUTCDays(b))
}

/** Die letzten n Tage inklusive heute, älteste zuerst. */
export function lastNDays(today: ISODate, n: number): ISODate[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))
}

/** Kalendertag eines Zeitstempels; mit Tagesgrenze zählt z. B. 01:00 Uhr noch zum Vortag. */
export function dateOf(isoDateTime: string, dayStartsAtHour = 0): ISODate {
  return todayISO(dayStartsAtHour, new Date(isoDateTime))
}
