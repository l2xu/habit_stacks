/**
 * Habit Stacks – vollständiges Datenmodell.
 *
 * Grundsatz: Logs + Events sind die Quelle der Wahrheit. Felder wie
 * `Habit.formation` oder `Habit.skippedInRow` sind materialisierte Caches, die die
 * Regel-Engine aus Logs + Datum idempotent neu berechnet.
 */

// ───────────────────────────── Primitive ─────────────────────────────

export type ID = string
/** Lokaler Kalendertag 'YYYY-MM-DD'. Tagesgrenze: `AppSettings.dayStartsAtHour`. */
export type ISODate = string
/** Zeitstempel nach ISO 8601, z. B. '2026-10-31T18:26:15.000Z'. */
export type ISODateTime = string

// ───────────────────────────── Darstellung ─────────────────────────────

/** Palette-Token eines Blocks. Konkrete Farben: `features/world/palette.ts`. */
export type BlockColor =
  | 'slate'
  | 'sky'
  | 'mustard'
  | 'terracotta'
  | 'cream'
  | 'sage'
  | 'lavender'
  | 'rose'
  | 'teal'

export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'anytime'

// ───────────────────────────── Habit (= Block) ─────────────────────────────

/** Anker = feste Basis-Gewohnheit, bricht und zerfällt nie. */
export type HabitRole = 'anchor' | 'stacked'

/** Wie ein Habit im Fokus-Modus abgearbeitet wird. */
export type HabitAction = { kind: 'check' } | { kind: 'timer'; durationSec: number }

/**
 * Lebenszyklus eines Blocks.
 * - forming: steckt in der Verfestigung (28 erledigte Tage, halbtransparenter "Geister-Block")
 * - solid:   verfestigt, massiver Teil des Turms (Anker ist immer solid)
 * - broken:  Verfestigung gescheitert, Block ist weggebrochen
 * - fallen:  fester Block abgefallen (zu oft in Folge nicht erledigt, siehe `SkipRules`)
 * - removed: vom Nutzer abgebaut
 * broken/fallen/removed liegen im Schutthaufen (`Tower.lostBlockIds`) und können neu gestapelt werden.
 */
export type BlockLifecycle = 'forming' | 'solid' | 'broken' | 'fallen' | 'removed'

export interface Habit {
  id: ID
  towerId: ID
  /** Voller Name, z. B. "10 Min. Lesen". Weiche Trennstellen (\u00AD) steuern den Umbruch auf dem Block. */
  title: string
  role: HabitRole
  action: HabitAction
  color: BlockColor
  lifecycle: BlockLifecycle
  /** Nur bei role 'stacked'. Bleibt nach Verfestigung/Bruch als Historie erhalten. */
  formation: FormationProgress | null
  /** Verfestigte gestapelte Blöcke: an aktiven Tagen in Folge übersprungen (siehe `RulesConfig.skip`). */
  skippedInRow?: number
  /** War schon einmal verfestigt – beim Neu-Stapeln startet der Geist mit `RulesConfig.restackHeadStart` Würfeln. */
  wasSolid?: boolean
  createdAt: ISODateTime
  /** Gesetzt, wenn lifecycle 'broken', 'fallen' oder 'removed' wird. */
  endedAt?: ISODateTime
}

// ───────────────────────────── Tower ─────────────────────────────

export interface Tower {
  id: ID
  /** z. B. "Morgenroutine" */
  name: string
  timeOfDay: TimeOfDay
  /** Stehende Blöcke von unten nach oben. Index 0 ist immer der Anker. */
  blockIds: ID[]
  /** Gebrochene/abgefallene Blöcke, neueste zuletzt (Historie, "Schutthaufen"). */
  lostBlockIds: ID[]
  createdAt: ISODateTime
  /** Pausiert seit diesem Kalendertag (einschließlich): Die Engine wertet den Turm nicht aus, Abhaken und Bearbeiten sind gesperrt. */
  pausedSince?: ISODate
  /** Frühere Pausen, älteste zuerst – auch sie wertet die Engine nicht aus; Streak und Wochenleiste überspringen sie. */
  pauses?: DateRange[]
  /** Push-Benachrichtigungen dieses Turms (fehlt = keine). */
  notify?: TowerNotify
}

/** Push-Benachrichtigungen eines Turms: eine Uhrzeit für Erinnerung und Warnung, höchstens eine Nachricht pro Tag. */
export interface TowerNotify {
  /** Ortszeit 'HH:MM'. Liegt sie vor der Tagesgrenze, gehört sie noch zum Vortag (letzte Chance vor dem Tageswechsel). */
  time: string
  /** Täglich erinnern, solange heute noch nicht alles erledigt ist. */
  remind: boolean
  /** Warnen, wenn ein Block bröckelt oder morgen abfällt, der Turm einzustürzen droht oder ein Geist wackelt. */
  warn: boolean
}

/** Kalendertage von – bis, beide einschließlich. */
export interface DateRange {
  from: ISODate
  to: ISODate
}

// ───────────────────────────── Verfestigung ─────────────────────────────

/**
 * Fortschritt der Verfestigung eines gestapelten Blocks: ein Würfel pro erledigtem Tag.
 * Regel „Nie zweimal verpassen“: Ein einzelner Fehltag lässt den Geist nur wackeln
 * (kein Würfel), mehr als `RulesConfig.formationGraceDays` Fehltage in Folge brechen ihn.
 */
export interface FormationProgress {
  startedOn: ISODate
  /** Erledigte Tage = Würfel im Geister-Block (höchstens 27). Erreicht er `RulesConfig.formationDays` → solid. */
  doneDays: number
  /** Verpasste Tage in Folge bis `evaluatedThrough`. */
  missedInRow: number
  solidifiedOn?: ISODate
  brokenOn?: ISODate
  /** Letzter Tag, den die Engine ausgewertet hat – macht die Neuberechnung idempotent. */
  evaluatedThrough: ISODate | null
}

// ───────────────────────────── Überspringen ─────────────────────────────

/**
 * Übersprungen = an einem Tag nicht erledigt – auch, wenn der ganze Turm an dem Tag nichts hatte.
 * Gilt nur für verfestigte, gestapelte Blöcke; jeder Block zählt für sich, die Position ist egal.
 */
export interface SkipRules {
  /** So oft in Folge übersprungen → der Block bröckelt. */
  crumbleAfter: number
  /** So oft in Folge übersprungen → er fällt auf den Schutthaufen. Fallen alle über dem Anker zugleich: Einsturz. */
  fallAfter: number
}

export interface RulesConfig {
  /** Erledigte Tage bis zur Verfestigung (28: 27 Tage füllen die 3×3×3 Mini-Würfel, der 28. macht den Block fest). */
  formationDays: number
  /** Fehltage in Folge, die ein Geister-Block übersteht (1 = „Nie zweimal verpassen“). */
  formationGraceDays: number
  skip: SkipRules
  /** Wie viele Geister-Blöcke gleichzeitig pro Turm erlaubt sind (1 = ein Habit nach dem anderen). */
  maxFormingPerTower: number
  /** Gedächtnis-Bonus: Würfel, mit denen ein früher verfestigter Block beim Neu-Stapeln startet. */
  restackHeadStart: number
}

// ───────────────────────────── Logs ─────────────────────────────

/** Ein erledigter Habit an einem Tag. Pro Habit und Tag existiert höchstens ein Log. */
export interface HabitLog {
  id: ID
  habitId: ID
  towerId: ID
  date: ISODate
  completedAt: ISODateTime
  /** Timer-Habits: tatsächlich gelaufene Sekunden (höchstens die Zieldauer). */
  durationSec?: number
  source: 'focus' | 'quick'
  sessionId?: ID
}

/** Schlüssel in `DomainState.logs`: `${habitId}|${date}` – erzwingt "ein Log pro Habit und Tag". */
export type LogKey = `${ID}|${ISODate}`

// ───────────────────────────── Events ─────────────────────────────

interface TowerEventBase {
  id: ID
  towerId: ID
  /** Kalendertag, auf den sich das Ereignis bezieht. */
  date: ISODate
  createdAt: ISODateTime
  /** Gesetzt, sobald die UI die zugehörige Animation abgespielt hat (z. B. Block fällt). */
  seenAt?: ISODateTime
}

/**
 * Ereignisprotokoll, das die Regel-Engine schreibt. Dient als Historie und als
 * Animations-Queue: Beim App-Start werden ungesehene Events nacheinander animiert.
 */
export type TowerEvent = TowerEventBase &
  (
    | { type: 'tower_created' }
    | { type: 'block_stacked'; habitId: ID }
    | { type: 'formation_wobbling'; habitId: ID }
    | { type: 'block_solidified'; habitId: ID }
    /** onDay: Kalendertag der Verfestigung (Stapeltag = Tag 1), an dem der Geist brach; level: seine Ebene. */
    | { type: 'block_broken'; habitId: ID; onDay: number; level: number }
    /** Verfestigter Block bröckelt: `skip.crumbleAfter`-mal in Folge nicht erledigt. */
    | { type: 'block_crumbling'; habitId: ID }
    | { type: 'block_recovered'; habitId: ID }
    /** Verfestigter Block abgefallen: `skip.fallAfter`-mal in Folge nicht erledigt. level: Ebene, auf der er stand. */
    | { type: 'block_fallen'; habitId: ID; level: number }
    | { type: 'block_removed'; habitId: ID }
    /**
     * Einsturz: Am selben Tag sind mehrere feste Blöcke abgefallen und über dem Anker steht nichts mehr.
     * Ersetzt deren einzelne `block_fallen`. habitIds von unten nach oben (Ebene 1, 2, …).
     */
    | { type: 'tower_collapsed'; habitIds: ID[] }
    | { type: 'routine_completed'; sessionId: ID }
  )

export type TowerEventType = TowerEvent['type']

// ───────────────────────────── Fokus-Modus ─────────────────────────────

export type FocusStepStatus = 'pending' | 'active' | 'done' | 'skipped'

/**
 * Timer, der App-Hintergrund und Reload übersteht: Laufzeit wird aus
 * `accumulatedSec + (now − runningSince)` berechnet statt hochgezählt.
 */
export interface TimerState {
  durationSec: number
  accumulatedSec: number
  /** Gesetzt, solange der Timer läuft. */
  runningSince: ISODateTime | null
}

export interface FocusStep {
  habitId: ID
  status: FocusStepStatus
  /** Nur bei Timer-Habits. */
  timer: TimerState | null
}

/** Eine Abarbeitung der Kette von unten nach oben. Wird persistiert, damit sie einen Reload übersteht. */
export interface FocusSession {
  id: ID
  towerId: ID
  date: ISODate
  startedAt: ISODateTime
  finishedAt?: ISODateTime
  steps: FocusStep[]
  activeIndex: number
  state: 'running' | 'completed' | 'aborted'
}

// ───────────────────────────── Einstellungen ─────────────────────────────

export interface AppSettings {
  /** Stunde, ab der ein neuer Tag beginnt (4 → bis 03:59 zählt zum Vortag). */
  dayStartsAtHour: number
  sound: boolean
  /** Naturgeräusche: Wind, tagsüber Vögel, abends Grillen. */
  ambience: boolean
  /** Nur Entwicklung: verschiebt "heute" um n Tage (Zeitreise zum Testen der Tagesregeln). */
  devDayOffset?: number
}

// ───────────────────────────── Persistenz ─────────────────────────────

/** Format der gespeicherten Daten. Ändert es sich, erhöhen – ältere Stände werden dann nicht mehr gelesen. */
export const SCHEMA_VERSION = 7

/** Alles, was lokal gespeichert wird. Normalisiert, damit Updates billig sind. */
export interface DomainState {
  schemaVersion: typeof SCHEMA_VERSION
  towers: Record<ID, Tower>
  /** Reihenfolge der Türme auf der Insel (links → rechts). */
  towerOrder: ID[]
  habits: Record<ID, Habit>
  logs: Record<LogKey, HabitLog>
  events: TowerEvent[]
  focus: FocusSession | null
  settings: AppSettings
  rules: RulesConfig
  /** Letzter Tag, bis zu dem die Regel-Engine alle Türme ausgewertet hat. */
  lastEvaluatedOn: ISODate | null
}

/**
 * Austauschbarer Speicher (IndexedDB im Web, später Capacitor Preferences/SQLite).
 * `load` liefert Rohdaten oder null; die Prüfung macht `domain/validate.ts`.
 */
export interface StorageDriver {
  readonly name: string
  load(): Promise<unknown>
  save(state: DomainState): Promise<void>
  clear(): Promise<void>
}

/** Format der Backup-Datei (JSON-Export/-Import). */
export interface BackupFile {
  app: 'habit-stacks'
  exportedAt: ISODateTime
  state: DomainState
}

// ───────────────────────────── View-Modelle (abgeleitet, nie gespeichert) ─────────────────────────────

/**
 * Tagesmarke für die Wochenleiste (älteste zuerst, zuletzt heute).
 * - done:    alle Blöcke erledigt (volles Kästchen)
 * - partial: nur ein Teil erledigt (halbes Kästchen)
 * - missed:  nichts erledigt (leeres Kästchen)
 * - pending: heute, noch offen (gestricheltes Kästchen)
 * - paused:  Turm war pausiert (Schloss)
 * - none:    Turm existierte noch nicht
 */
export type DayMark = 'done' | 'partial' | 'missed' | 'pending' | 'paused' | 'none'

export type BlockVisual = 'anchor' | 'solid' | 'forming' | 'crumbling'

export interface BlockVM {
  id: ID
  title: string
  color: BlockColor
  visual: BlockVisual
  /** 0 = Anker */
  level: number
  doneToday: boolean
  /** forming: erledigte Tage inklusive heute („18/28“) – je ein Mini-Würfel, höchstens 27. */
  stones?: number
  formationTarget?: number
  /** forming: gestern verpasst und heute noch offen – noch ein Fehltag, dann bricht der Geist. */
  wobbling?: boolean
  /** forming: startet erst morgen (heute wurde schon ein Block im Turm fest) – heute nicht fällig. */
  upcoming?: boolean
  /** crumbling: 0 = beginnt zu bröckeln, 1 = fällt beim nächsten Fehltag ab */
  crumbleProgress?: number
  /** crumbling: in so vielen Tagen fällt er ohne Häkchen ab (1 = morgen früh, wenn er heute fehlt). */
  fallIn?: number
  /** Verfestigte Blöcke: Tage in Folge nicht erledigt (heute erledigt → 0). */
  skips?: number
}

/** Block im Schutthaufen, neuester zuerst. */
export interface LostBlockVM {
  id: ID
  title: string
  color: BlockColor
  /** collapsed: mit dem ganzen Turm eingestürzt. */
  reason: 'broken' | 'fallen' | 'removed' | 'collapsed'
  /** Tag des Verlusts (aus dem zugehörigen Ereignis). */
  lostOn: ISODate | null
  /** broken: an welchem Verfestigungstag der Block weggebrochen ist. */
  onDay?: number
  /** Würfel, mit denen er beim Neu-Stapeln startet (Gedächtnis-Bonus, sonst 0). */
  headStart: number
}

export interface TowerVM {
  id: ID
  name: string
  blocks: BlockVM[]
  /** Schutthaufen: gebrochene, abgefallene und abgebaute Blöcke, neuester zuerst. */
  lost: LostBlockVM[]
  /** Letzte 7 Tage, älteste zuerst (zuletzt heute). */
  week: { date: ISODate; mark: DayMark }[]
  /**
   * Aktive Tage am Stück: mindestens ein Block erledigt (heute zählt, sobald einer erledigt ist). Pausierte Tage
   * zählen nicht mit und unterbrechen ihn nicht. Nur Anzeige.
   */
  streak: number
  /** Nächster offener Block von unten – Einstieg für den Fokus-Modus (null, wenn pausiert oder alles erledigt). */
  nextBlock: (BlockVM & { action: HabitAction }) | null
  /** Pausiert seit diesem Tag – nichts geht verloren, Abhaken ist gesperrt. */
  pausedSince: ISODate | null
  /** Bröckelnde Blöcke, heute noch offen: in so vielen Tagen fällt ohne Häkchen der erste ab (1 = morgen früh). */
  fallIn: number | null
  /** Alle festen Blöcke über dem Anker (mindestens 2) bröckeln und sind heute offen – der Turm droht einzustürzen. */
  collapsing: boolean
  /** Etwas geht verloren, wenn heute nichts passiert: Ein Block bröckelt oder ein Geist wackelt (nie, wenn pausiert). */
  atRisk: boolean
  /** Kein Geist im Weg und nicht pausiert: Ein neuer Block darf oben drauf (`canStack`). */
  stackable: boolean
}
