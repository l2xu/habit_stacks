import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { addDays, dateOf, lastNDays } from '@/domain/dates'
import { restackHeadStart } from '@/domain/editor'
import { isPausedOn } from '@/domain/engine'
import type { BlockVM, DayMark, DomainState, Habit, ID, ISODate, LostBlockVM, Tower, TowerVM } from '@/domain/types'
import { useAppStore } from './useAppStore'

type WorldSlice = Pick<DomainState, 'towers' | 'towerOrder' | 'habits' | 'logs' | 'events' | 'rules' | 'settings'>

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Baut das View-Modell eines Turms. Liest nur den gespeicherten Zustand
 * (lifecycle, formation, skippedInRow, Pausen) – berechnet ihn nicht. Das macht die Engine.
 */
export function buildTowerVM(s: WorldSlice, tower: Tower, today: ISODate): TowerVM {
  const habits = tower.blockIds.flatMap((id) => s.habits[id] ?? [])
  const isDone = (habitId: string, date: ISODate) => `${habitId}|${date}` in s.logs
  const towerEvents = s.events.filter((e) => e.towerId === tower.id)
  const hour = s.settings.dayStartsAtHour
  const paused = (date: ISODate) => isPausedOn(tower, date)
  // Ein gestapelter Block zählt ab dem Stapeltag (auch nach dem Neu-Stapeln aus dem Schutthaufen).
  const since = (h: Habit) => h.formation?.startedOn ?? dateOf(h.createdAt, hour)

  const markFor = (date: ISODate): DayMark => {
    if (date < dateOf(tower.createdAt, hour)) return 'none'
    if (paused(date)) return 'paused'
    const active = habits.filter((h) => since(h) <= date)
    const done = active.filter((h) => isDone(h.id, date)).length
    if (active.length > 0 && done === active.length) return 'done'
    if (date === today) return 'pending'
    return done > 0 ? 'partial' : 'missed'
  }

  // Aktive Tage: mindestens ein Block erledigt – auch von Blöcken, die inzwischen im Schutthaufen liegen.
  // Pausierte Tage zählen nicht mit und unterbrechen den Streak nicht.
  const activeOn = new Set<ISODate>()
  for (const l of Object.values(s.logs)) if (l.towerId === tower.id) activeOn.add(l.date)
  let streak = activeOn.has(today) && !paused(today) ? 1 : 0
  for (let d = addDays(today, -1); paused(d) || activeOn.has(d); d = addDays(d, -1)) if (!paused(d)) streak++

  const { formationDays, skip } = s.rules
  const blocks = habits.map((h, level): BlockVM => {
    const base = { id: h.id, title: h.title, color: h.color, level, doneToday: isDone(h.id, today) }
    if (h.role === 'anchor') return { ...base, visual: 'anchor' }
    if (h.lifecycle === 'forming' && h.formation) {
      const { doneDays, missedInRow } = h.formation
      // Startet erst morgen: heute weder fällig noch wackelnd, Würfel wie beim Stapeln.
      if (h.formation.startedOn > today) return { ...base, visual: 'forming', stones: doneDays, formationTarget: formationDays, upcoming: true }
      return {
        ...base,
        visual: 'forming',
        // Heute zählt mit, sobald der Block erledigt ist (die Engine bestätigt das morgen). Würfel: höchstens 27.
        stones: Math.min(formationDays, doneDays + (base.doneToday ? 1 : 0)),
        formationTarget: formationDays,
        wobbling: missedInRow > 0 && !base.doneToday,
      }
    }
    const skips = base.doneToday ? 0 : (h.skippedInRow ?? 0)
    if (skips >= skip.crumbleAfter) {
      // 0 = beginnt zu bröckeln, 1 = letzter Tag vor dem Abfallen.
      const span = skip.fallAfter - 1 - skip.crumbleAfter
      const progress = span > 0 ? clamp01((skips - skip.crumbleAfter) / span) : 1
      return { ...base, skips, visual: 'crumbling', crumbleProgress: progress, fallIn: Math.max(1, skip.fallAfter - skips) }
    }
    return { ...base, skips, visual: 'solid' }
  })

  const pausedSince = tower.pausedSince ?? null
  const crumbling = pausedSince ? [] : blocks.filter((b) => b.visual === 'crumbling' && !b.doneToday)
  const solids = blocks.filter((b) => b.level > 0 && (b.visual === 'solid' || b.visual === 'crumbling'))
  const nextIndex = pausedSince ? -1 : blocks.findIndex((b) => !b.doneToday && !b.upcoming)
  const next = blocks[nextIndex]
  const nextHabit = habits[nextIndex]

  return {
    id: tower.id,
    name: tower.name,
    blocks,
    lost: buildLost(s, tower, towerEvents),
    week: lastNDays(today, 7).map((date) => ({ date, mark: markFor(date) })),
    streak,
    nextBlock: next && nextHabit ? { ...next, action: nextHabit.action } : null,
    pausedSince,
    fallIn: crumbling.length > 0 ? Math.min(...crumbling.map((b) => b.fallIn ?? skip.fallAfter)) : null,
    collapsing: solids.length >= 2 && crumbling.length === solids.length,
    atRisk: !pausedSince && (crumbling.length > 0 || blocks.some((b) => b.wobbling)),
    stackable: !pausedSince && blocks.filter((b) => b.visual === 'forming').length < s.rules.maxFormingPerTower,
  }
}

const LOSS_EVENTS = new Set(['block_broken', 'block_fallen', 'block_removed'])

/** Schutthaufen, neuester Verlust zuerst; Datum und Verfestigungstag aus dem letzten Verlust-Ereignis. */
function buildLost(s: WorldSlice, tower: Tower, towerEvents: DomainState['events']): LostBlockVM[] {
  const lastLoss = new Map<ID, DomainState['events'][number]>()
  for (const e of towerEvents) {
    if (LOSS_EVENTS.has(e.type) && 'habitId' in e) lastLoss.set(e.habitId, e)
    if (e.type === 'tower_collapsed') for (const id of e.habitIds) lastLoss.set(id, e)
  }

  return tower.lostBlockIds.toReversed().flatMap((id): LostBlockVM[] => {
    const h = s.habits[id]
    if (!h || (h.lifecycle !== 'broken' && h.lifecycle !== 'fallen' && h.lifecycle !== 'removed')) return []
    const e = lastLoss.get(id)
    return [
      {
        id,
        title: h.title,
        color: h.color,
        reason: e?.type === 'tower_collapsed' ? 'collapsed' : h.lifecycle,
        lostOn: e?.date ?? (h.endedAt ? dateOf(h.endedAt, s.settings.dayStartsAtHour) : null),
        onDay: e?.type === 'block_broken' ? e.onDay : undefined,
        headStart: restackHeadStart(s, h),
      },
    ]
  })
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Teilt unveränderte Teile mit dem vorigen View-Modell desselben Turms: Ist `next` inhaltlich gleich, kommt `prev`
 * zurück, sonst `next` mit allen unveränderten Blöcken aus `prev`. So behalten unveränderte Blöcke ihre Lage samt
 * Geometrie (`layoutTower`), und die Caches der Canvas-Welt greifen weiter – ein Häkchen ändert nur den einen Block.
 */
export function reuseUnchanged(prev: TowerVM | undefined, next: TowerVM): TowerVM {
  if (!prev) return next
  if (same(prev, next)) return prev
  const old = new Map(prev.blocks.map((b) => [b.id, b]))
  return {
    ...next,
    blocks: next.blocks.map((b) => {
      const o = old.get(b.id)
      return o && same(o, b) ? o : b
    }),
  }
}

/** Zuletzt ausgegebenes View-Modell je Turm – geteilt von Startseite, Fokus-Modus und Editor. */
const lastVMs = new Map<ID, TowerVM>()

function sharedTowerVM(s: WorldSlice, tower: Tower, today: ISODate): TowerVM {
  const vm = reuseUnchanged(lastVMs.get(tower.id), buildTowerVM(s, tower, today))
  lastVMs.set(tower.id, vm)
  return vm
}

const useWorldSlice = (): WorldSlice =>
  useAppStore(
    useShallow((s) => ({
      towers: s.towers,
      towerOrder: s.towerOrder,
      habits: s.habits,
      logs: s.logs,
      events: s.events,
      rules: s.rules,
      settings: s.settings,
    })),
  )

/** View-Modelle der Türme auf der Insel. */
export function useTowerVMs(today: ISODate): TowerVM[] {
  const slice = useWorldSlice()
  return useMemo(
    () =>
      slice.towerOrder.flatMap((id) => {
        const tower = slice.towers[id]
        return tower ? [sharedTowerVM(slice, tower, today)] : []
      }),
    [slice, today],
  )
}

/** Ein einzelner Turm (null, sobald er gelöscht ist). */
export function useTowerVM(towerId: ID, today: ISODate): TowerVM | null {
  const slice = useWorldSlice()
  return useMemo(() => {
    const tower = slice.towers[towerId]
    return tower ? sharedTowerVM(slice, tower, today) : null
  }, [slice, towerId, today])
}
