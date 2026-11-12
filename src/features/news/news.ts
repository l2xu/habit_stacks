import { diffDays } from '@/domain/dates'
import type { BlockVM, DomainState, ISODate, TowerEvent, TowerEventType } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import type { TowerEffect } from '@/features/world/effects'

/** Ereignisse, die beim Öffnen als Neuigkeit gezeigt und am Turm animiert werden. Alle anderen gelten still als gesehen. */
export const NEWS_EVENTS: ReadonlySet<TowerEventType> = new Set<TowerEventType>([
  'tower_collapsed',
  'block_fallen',
  'block_broken',
  'block_solidified',
  'formation_wobbling',
  'block_crumbling',
])

export type NewsTone = 'good' | 'warn' | 'bad'

export interface NewsItem {
  event: TowerEvent
  tone: NewsTone
  title: string
  body: string
  effect: TowerEffect | null
}

const localDate = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, day, 12)
}
const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'long' })
const SHORT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })

export function relativeDay(date: ISODate, today: ISODate): string {
  const n = diffDays(today, date)
  if (n === 0) return 'heute'
  if (n === 1) return 'gestern'
  if (n < 7) return `am ${WEEKDAY.format(localDate(date))}`
  return `am ${SHORT.format(localDate(date))}`
}

/** „Pausiert ab heute“, „Pausiert seit gestern“, „Pausiert seit Freitag“, „Pausiert seit 3. Nov.“ */
export function pausedLabel(pausedSince: ISODate, today: ISODate): string {
  return pausedSince >= today ? 'Pausiert ab heute' : `Pausiert seit ${relativeDay(pausedSince, today).replace(/^am /, '')}`
}

type NewsSource = Pick<DomainState, 'towers' | 'habits' | 'rules'>

/** Text und Animation zu einem Engine-Ereignis. */
export function describeEvent(event: TowerEvent, s: NewsSource, today: ISODate): NewsItem {
  const t = s.towers[event.towerId]
  const tower = plainTitle(t?.name ?? 'Turm')
  const habit = 'habitId' in event ? s.habits[event.habitId] : undefined
  const name = plainTitle(habit?.title ?? 'Block')
  const { formationDays, skip } = s.rules
  const stones = habit?.formation?.doneDays ?? 0
  const lostBlock = (visual: BlockVM['visual']): BlockVM | null =>
    habit
      ? {
          id: habit.id,
          title: habit.title,
          color: habit.color,
          visual,
          level: 0,
          doneToday: false,
          // Der zerspringende Geist zeigt noch einmal alle Würfel, die er bis dahin hatte.
          stones,
          formationTarget: formationDays,
          wobbling: visual === 'forming',
        }
      : null

  switch (event.type) {
    case 'block_fallen': {
      const block = lostBlock('crumbling')
      return {
        event,
        tone: 'bad',
        title: `${name} ist abgefallen`,
        body: `${skip.fallAfter} Tage in Folge nicht erledigt. Er liegt jetzt auf dem Schutthaufen – von dort kannst du ihn neu stapeln.`,
        effect: block && { key: event.id, kind: 'fall', block, level: event.level },
      }
    }
    case 'tower_collapsed': {
      // Die eingestürzten Blöcke noch einmal an ihren alten Plätzen über dem Anker (Ebene 1, 2, …).
      const blocks = event.habitIds.flatMap((id, i): BlockVM[] => {
        const h = s.habits[id]
        return h ? [{ id, title: h.title, color: h.color, visual: 'crumbling', level: i + 1, doneToday: false }] : []
      })
      return {
        event,
        tone: 'bad',
        title: `${tower} ist eingestürzt`,
        body: `${skip.fallAfter} Tage ohne Häkchen – ${blocks.length} Blöcke liegen jetzt auf dem Schutthaufen. Der Anker steht noch, von dort kannst du sie neu stapeln.`,
        effect: blocks.length > 0 ? { key: event.id, kind: 'collapse', blocks } : null,
      }
    }
    case 'block_broken': {
      const block = lostBlock('forming')
      return {
        event,
        tone: 'bad',
        title: `${name} ist weggebrochen`,
        body: `Zweimal hintereinander verpasst – nach ${stones} von ${formationDays} Tagen. Der Rest von ${tower} steht weiter.`,
        effect: block && { key: event.id, kind: 'break', block, level: event.level },
      }
    }
    case 'block_solidified':
      return {
        event,
        tone: 'good',
        title: `${name} ist verfestigt!`,
        body:
          event.date === today
            ? `${formationDays} Tage geschafft – jetzt ein fester Teil von ${tower}. Du kannst schon den nächsten Block stapeln, er startet morgen.`
            : `${formationDays} Tage geschafft – jetzt ein fester Teil von ${tower}.`,
        effect: { key: event.id, kind: 'solidify', habitId: event.habitId },
      }
    case 'formation_wobbling':
      return {
        event,
        tone: 'warn',
        title: `${name} wackelt`,
        body: `${relativeDay(event.date, today).replace(/^\w/, (c) => c.toUpperCase())} verpasst. Heute erledigen – wer zweimal hintereinander verpasst, verliert den Block.`,
        effect: null,
      }
    case 'block_crumbling':
      return {
        event,
        tone: 'warn',
        title: `${name} bröckelt`,
        body: `${skip.crumbleAfter} Tage in Folge nicht erledigt. Erledige ihn heute – nach ${skip.fallAfter} Tagen fällt er ab.`,
        effect: { key: event.id, kind: 'crumble', habitId: event.habitId },
      }
    default:
      return { event, tone: 'good', title: tower, body: '', effect: null }
  }
}
