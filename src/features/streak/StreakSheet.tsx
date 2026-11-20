import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { addDays, diffDays } from '@/domain/dates'
import { isPausedOn } from '@/domain/engine'
import { canEditDay, type TowerChange } from '@/domain/retro'
import type { DayMark, Habit, ID, ISODate } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import { BlockThumb } from '@/features/world/BlockThumb'
import { useToday } from '@/hooks/useToday'
import { sfx } from '@/store/sfx'
import { useTowerHistory, useTowerVM, type TowerHistory } from '@/store/selectors'
import { useAppStore } from '@/store/useAppStore'
import { useLoop } from '@/ui/Loop'
import { PanelHeader } from '@/ui/PanelHeader'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { ARROW, CHECK, FLAME, LOCK, PENCIL } from '@/ui/sprites'
import { daysLabel, streakTitle } from './streak'

const pad = (n: number) => String(n).padStart(2, '0')
const local = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, day, 12)
}
const monthOf = (d: ISODate) => d.slice(0, 7)
function shiftMonth(month: string, n: number): string {
  const d = local(`${month}-01`)
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
/** Tage eines Monats im Raster Mo–So; null = Lücke vor dem Ersten. */
function monthCells(month: string): (ISODate | null)[] {
  const first = local(`${month}-01`)
  const lead = (first.getDay() + 6) % 7
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`)]
}

const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
const LONG = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function dayTitle(date: ISODate, today: ISODate): string {
  const long = LONG.format(local(date))
  const n = diffDays(today, date)
  return n === 0 ? `Heute · ${long}` : n === 1 ? `Gestern · ${long}` : long
}

const MARK_LABEL: Record<DayMark, string> = {
  done: 'alles erledigt',
  partial: 'teilweise erledigt',
  missed: 'verpasst',
  pending: 'noch offen',
  paused: 'pausiert',
  none: '',
}

const BOX: Record<DayMark, string> = {
  done: 'border-ink bg-moss',
  partial: 'border-ink bg-[linear-gradient(135deg,var(--color-moss)_50%,transparent_50%)]',
  missed: 'border-ink-soft/70',
  pending: 'border-ink border-dashed',
  paused: 'border-ink-soft/50 bg-ink-soft/15',
  none: 'border-transparent',
}

const LEGEND = [
  ['done', 'Alles'],
  ['partial', 'Teilweise'],
  ['missed', 'Verpasst'],
  ['paused', 'Pause'],
] as const satisfies readonly (readonly [DayMark, string])[]

/**
 * Streak-Overlay: der ganze Verlauf eines Turms als Monatskalender. Antippen zeigt, was an dem Tag erledigt war.
 * Im Bearbeitungsmodus lassen sich die letzten Tage nachtragen (oder korrigieren) – der Turm rechnet sofort neu.
 */
export function StreakSheet({ towerId, onClose }: { towerId: ID; onClose: () => void }) {
  const today = useToday()
  const vm = useTowerVM(towerId, today)
  const history = useTowerHistory(towerId, today)
  const domain = useAppStore(useShallow((s) => ({ towers: s.towers, rules: s.rules, settings: s.settings })))
  const setPastDone = useAppStore((s) => s.setPastDone)
  const showToast = useAppStore((s) => s.showToast)
  const [month, setMonth] = useState(() => monthOf(today))
  const [selected, setSelected] = useState<ISODate | null>(null)
  const [editing, setEditing] = useState(false)
  if (!vm || !history) return null

  const editable = (d: ISODate) => canEditDay(domain, towerId, d, today)
  const select = (d: ISODate) => {
    sfx('tap')
    setSelected(d)
    setMonth(monthOf(d))
  }
  const startEditing = () => {
    sfx('toggle')
    setEditing(true)
    const yesterday = addDays(today, -1)
    if (!(selected && editable(selected)) && editable(yesterday)) {
      setSelected(yesterday)
      setMonth(monthOf(yesterday))
    }
  }
  const apply = (date: ISODate, changes: Record<ID, boolean>, habits: Habit[]) => {
    const change = setPastDone(towerId, date, changes, today)
    if (!change) return
    const message = describeChange(change, habits)
    sfx(change.lost.length ? 'fall' : change.solid.length ? 'solidify' : change.back.length ? 'land' : Object.values(changes).some(Boolean) ? 'stone' : 'toggle')
    if (message) showToast(message)
  }

  const minMonth = monthOf(history.created)
  const maxMonth = monthOf(today)

  return (
    <>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            {streakTitle(vm.streak)}
            {vm.streak > 0 && <PixelIcon sprite={FLAME} px={2} className="shrink-0" />}
          </span>
        }
        subtitle={`${vm.name} · Rekord ${daysLabel(history.best)} · ${daysLabel(history.activeTotal)} aktiv`}
        onClose={onClose}
      />

      <div className="mt-4 flex items-center gap-2">
        <PixelButton aria-label="Voriger Monat" disabled={month <= minMonth} onClick={() => setMonth(shiftMonth(month, -1))} className="size-10 shrink-0">
          <PixelIcon sprite={ARROW} px={1.5} className="-rotate-90" />
        </PixelButton>
        <h3 className="flex-1 text-center text-[17px] leading-none font-semibold" aria-live="polite">
          {MONTH.format(local(`${month}-01`))}
        </h3>
        <PixelButton aria-label="Nächster Monat" disabled={month >= maxMonth} onClick={() => setMonth(shiftMonth(month, 1))} className="size-10 shrink-0">
          <PixelIcon sprite={ARROW} px={1.5} className="rotate-90" />
        </PixelButton>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-center font-micro text-[10px] leading-none text-ink-soft" aria-hidden>
            {w}
          </span>
        ))}
        {monthCells(month).map((d, i) =>
          d ? (
            <DayCell
              key={d}
              date={d}
              mark={history.markOn(d)}
              isToday={d === today}
              selected={d === selected}
              dim={editing && !editable(d)}
              onSelect={() => select(d)}
            />
          ) : (
            <span key={`lead-${i}`} />
          ),
        )}
      </div>

      <ul className="mt-2.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] leading-none text-ink-soft">
        {LEGEND.map(([mark, label]) => (
          <li key={mark} className="flex items-center gap-1.5">
            <span className={`block size-3 border-2 ${BOX[mark]}`} />
            {label}
          </li>
        ))}
      </ul>

      {editing && (
        <p className="px-frame px-gold mt-3 px-3 py-2 text-[14px] leading-snug">
          Tippe einen der letzten {domain.rules.editableDays} Tage an und hake ab, was du erledigt hast. Der Turm wird sofort neu berechnet.
        </p>
      )}

      {selected && (
        <DayDetail
          key={selected}
          date={selected}
          today={today}
          history={history}
          paused={isPausedOn(domain.towers[towerId] ?? {}, selected)}
          editing={editing}
          editable={editable(selected)}
          editableDays={domain.rules.editableDays}
          onChange={(changes) => apply(selected, changes, history.blocksOn(selected))}
        />
      )}

      {editing ? (
        <PixelButton
          variant="go"
          onClick={() => {
            sfx('toggle')
            setEditing(false)
          }}
          className="mt-4 h-12 w-full text-[17px] font-semibold text-paper"
        >
          Fertig
        </PixelButton>
      ) : (
        <PixelButton onClick={startEditing} className="mt-4 h-12 w-full gap-2 text-[16px] font-semibold">
          <PixelIcon sprite={PENCIL} px={1.5} />
          Tage nachtragen
        </PixelButton>
      )}
    </>
  )
}

interface DayCellProps {
  date: ISODate
  mark: DayMark
  isToday: boolean
  selected: boolean
  /** Bearbeitungsmodus: Dieser Tag lässt sich nicht nachtragen. */
  dim: boolean
  onSelect: () => void
}

function DayCell({ date, mark, isToday, selected, dim, onSelect }: DayCellProps) {
  const n = Number(date.slice(8))
  // Vor dem Turmbau und in der Zukunft gibt es nichts zu sehen.
  if (mark === 'none') {
    return (
      <span className="grid h-10 place-items-center font-micro text-[11px] leading-none text-ink-soft/40" aria-hidden>
        {n}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${LONG.format(local(date))}${isToday ? ' (heute)' : ''}: ${MARK_LABEL[mark]}`}
      className={`relative grid h-10 cursor-pointer place-items-center outline-offset-2 outline-focus transition-opacity ${selected ? 'outline-3' : 'focus-visible:outline-3'} ${dim ? 'opacity-35' : ''}`}
    >
      {mark === 'pending' ? <PendingBox /> : <span className={`absolute inset-0 border-2 ${BOX[mark]}`} />}
      {mark === 'paused' ? (
        <PixelIcon sprite={LOCK} px={1} className="relative opacity-70" />
      ) : (
        <span className={`relative font-micro text-[11px] leading-none ${isToday ? 'underline decoration-2 underline-offset-2' : ''}`}>{n}</span>
      )}
    </button>
  )
}

const PULSE = { values: { opacity: [0.45, 1, 0.45] }, duration: 1.4 }

/** Das heute noch offene Kästchen pulsiert. */
function PendingBox() {
  const ref = useLoop<HTMLSpanElement>(PULSE)
  return <span ref={ref} className={`absolute inset-0 border-2 ${BOX.pending}`} />
}

interface DayDetailProps {
  date: ISODate
  today: ISODate
  history: TowerHistory
  paused: boolean
  editing: boolean
  editable: boolean
  editableDays: number
  onChange: (changes: Record<ID, boolean>) => void
}

/** Blöcke eines Tages in Routine-Reihenfolge (Anker zuerst) – im Bearbeitungsmodus zum Abhaken. */
function DayDetail({ date, today, history, paused, editing, editable, editableDays, onChange }: DayDetailProps) {
  const blocks = history.blocksOn(date)
  const done = blocks.filter((h) => history.isDone(h.id, date))
  const canToggle = editing && editable
  const allDone = blocks.length > 0 && done.length === blocks.length
  const note = paused
    ? 'Pausiert – dieser Tag zählt nicht.'
    : !editing || editable
      ? null
      : date === today
        ? 'Heute hakst du im Fokus-Modus ab.'
        : `Nachtragen geht nur für die letzten ${editableDays} Tage.`

  return (
    <section className="mt-4 border-t-2 border-dashed border-ink/25 pt-3" aria-label={dayTitle(date, today)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] leading-tight font-semibold">{dayTitle(date, today)}</h3>
          {!paused && (
            <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">
              {done.length} von {blocks.length} erledigt
            </p>
          )}
        </div>
        {canToggle && blocks.length > 1 && (
          <PixelButton
            onClick={() => onChange(Object.fromEntries(blocks.map((h) => [h.id, !allDone])))}
            className="h-9 shrink-0 px-3 text-[14px] font-semibold"
          >
            {allDone ? 'Alle entfernen' : 'Alle abhaken'}
          </PixelButton>
        )}
      </div>
      {note && <p className="mt-2 text-[13px] leading-snug text-ink-soft">{note}</p>}
      {!paused && (
        <ul className="mt-2 grid gap-1.5">
          {blocks.map((h) => {
            const isDone = history.isDone(h.id, date)
            return <DayBlockRow key={h.id} habit={h} done={isDone} onToggle={canToggle ? () => onChange({ [h.id]: !isDone }) : undefined} />
          })}
        </ul>
      )}
    </section>
  )
}

const STATUS: Record<Habit['lifecycle'], string> = {
  forming: 'Geist',
  solid: 'Fester Block',
  broken: 'Weggebrochen · im Schutthaufen',
  fallen: 'Abgefallen · im Schutthaufen',
  removed: 'Abgebaut',
}

/** Ein Block an einem Tag: erledigt oder nicht; mit `onToggle` zum Abhaken. */
function DayBlockRow({ habit, done, onToggle }: { habit: Habit; done: boolean; onToggle?: () => void }) {
  const title = plainTitle(habit.title)
  const content = (
    <>
      <BlockThumb color={habit.color} size={32} className={habit.lifecycle === 'solid' ? '' : 'opacity-55'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-tight font-semibold">{title}</span>
        <span className="block truncate text-[13px] leading-tight text-ink-soft">{habit.role === 'anchor' ? 'Anker' : STATUS[habit.lifecycle]}</span>
      </span>
      <span aria-hidden className={`px-frame grid size-8 shrink-0 place-items-center [--px:2px] ${done ? 'px-go' : 'px-white'}`}>
        {done && <PixelIcon sprite={CHECK} px={2} colors={{ X: '#f4f2e8' }} />}
      </span>
    </>
  )
  return (
    <li>
      {onToggle ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={title}
          onClick={onToggle}
          className="px-frame px-button flex min-h-13 w-full items-center gap-2.5 py-1.5 pr-2 pl-2 text-left"
        >
          {content}
        </button>
      ) : (
        <div className="px-frame flex min-h-13 items-center gap-2.5 py-1.5 pr-2 pl-2" aria-label={`${title}: ${done ? 'erledigt' : 'nicht erledigt'}`}>
          {content}
        </div>
      )}
    </li>
  )
}

/** Rückmeldung, wenn das Nachtragen den Turm verändert hat. */
function describeChange(c: TowerChange, habits: Habit[]): string | null {
  const name = (id: ID) => `„${plainTitle(habits.find((h) => h.id === id)?.title ?? 'Block')}“`
  const names = (ids: ID[]) => ids.map(name).join(' und ')
  const one = (ids: ID[], singular: string, plural: string) => `${names(ids)} ${ids.length === 1 ? singular : plural}`
  if (c.back.length) return `${one(c.back, 'steht', 'stehen')} wieder auf dem Turm.`
  if (c.lost.length) return `${one(c.lost, 'liegt', 'liegen')} jetzt im Schutthaufen.`
  if (c.solid.length) return `${one(c.solid, 'ist', 'sind')} jetzt fest!`
  if (c.ghost.length) return `${one(c.ghost, 'ist wieder ein Geist', 'sind wieder Geister')}.`
  return null
}
