import type { DayMark, ISODate, TowerVM } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import { pausedLabel } from '@/features/news/news'
import { useToday } from '@/hooks/useToday'
import { useLoop } from '@/ui/Loop'
import { PixelIcon } from '@/ui/PixelIcon'
import { FLAME, LOCK, WARN } from '@/ui/sprites'

const MARK_LABEL: Record<DayMark, string> = {
  done: 'komplett erledigt',
  partial: 'teilweise erledigt',
  missed: 'verpasst',
  pending: 'noch offen',
  paused: 'pausiert',
  none: 'Turm gab es noch nicht',
}

const BOX: Record<DayMark, string> = {
  done: 'border-ink bg-moss',
  partial: 'border-ink bg-[linear-gradient(to_right,var(--color-moss)_50%,transparent_50%)]',
  missed: 'border-ink-soft/70',
  pending: 'border-ink border-dashed',
  paused: 'border-ink-soft/50 bg-ink-soft/15',
  none: 'border-ink-soft/25',
}

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
const weekday = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return WEEKDAY.format(new Date(y, m - 1, day, 12)).replace('.', '')
}

export const streakLabel = (n: number) => (n === 0 ? 'Noch kein Streak' : n === 1 ? '1 Tag am Stück' : `${n} Tage am Stück`)

/** Was heute verloren gehen kann – das Schlimmste zuerst; null = alles sicher. */
function riskLine(tower: TowerVM): string | null {
  if (tower.collapsing) return 'Turm bröckelt – heute alles erledigen!'
  if (tower.blocks.some((b) => b.wobbling)) return 'Gestern verpasst – heute nicht nochmal!'
  const crumbling = tower.blocks.filter((b) => b.visual === 'crumbling' && !b.doneToday)
  if (crumbling.length > 1) return `${crumbling.length} Blöcke bröckeln – heute erledigen!`
  return crumbling[0] ? `„${plainTitle(crumbling[0].title)}“ bröckelt – heute erledigen!` : null
}

const inDays = (n: number) => (n <= 1 ? 'morgen früh' : `in ${n} Tagen`)

/** Countdown unter der Warnung: wann ohne Häkchen der erste Block fällt bzw. der Turm einstürzt. */
function fallLine(tower: TowerVM): string | null {
  if (tower.fallIn === null) return null
  const crumbling = tower.blocks.filter((b) => b.visual === 'crumbling' && !b.doneToday)
  if (tower.collapsing) return `Ohne Häkchen stürzt der Turm spätestens ${inDays(Math.max(...crumbling.map((b) => b.fallIn ?? 1)))} ein.`
  const first = crumbling.find((b) => b.fallIn === tower.fallIn)
  return `${first ? `„${plainTitle(first.title)}“` : 'Ein Block'} fällt ohne Häkchen ${inDays(tower.fallIn)} ab.`
}

/**
 * Kopf der Detailansicht: Streak (oder Warnung mit Countdown, wenn heute etwas verloren gehen kann; Schloss, wenn
 * pausiert) und eine Wochenleiste mit einem Kästchen pro Tag – zuletzt heute.
 */
export function StreakPanel({ tower }: { tower: TowerVM }) {
  const today = useToday()
  const risk = riskLine(tower)
  const fall = fallLine(tower)

  return (
    <section className="px-4 pt-3" aria-label={`Woche von ${tower.name}`}>
      {tower.pausedSince ? (
        <h2 className="flex items-center gap-2 text-[17px] leading-none font-semibold">
          <PixelIcon sprite={LOCK} px={1.5} className="shrink-0" />
          <span className="truncate">{pausedLabel(tower.pausedSince, today)}</span>
        </h2>
      ) : risk ? (
        <>
          <h2 className="flex items-center gap-2 text-[17px] leading-none font-semibold text-brick">
            <PixelIcon sprite={WARN} px={1.5} className="shrink-0" />
            <span className="truncate">{risk}</span>
          </h2>
          {fall && <p className="mt-1 truncate pl-[22px] text-[13px] leading-[14px] text-ink-soft">{fall}</p>}
        </>
      ) : (
        <h2 className="flex items-center gap-2 text-[18px] leading-none font-semibold">
          {streakLabel(tower.streak)}
          {tower.streak > 0 && <PixelIcon sprite={FLAME} px={1.5} />}
        </h2>
      )}
      <ol className="mt-2.5 grid grid-cols-7 gap-1.5">
        {tower.week.map((day, i) => {
          const today = i === tower.week.length - 1
          return (
            <li key={day.date} className="flex flex-col items-center gap-1">
              {day.mark === 'pending' ? (
                <PendingBox />
              ) : (
                <span className={`block h-4 w-full border-2 ${BOX[day.mark]}`} />
              )}
              <span className={`font-micro text-[10px] leading-none ${today ? 'text-ink' : 'text-ink-soft'}`} aria-hidden>
                {today ? 'Heute' : weekday(day.date)}
              </span>
              <span className="sr-only">
                {today ? 'Heute' : weekday(day.date)}: {MARK_LABEL[day.mark]}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const PULSE = { values: { opacity: [0.45, 1, 0.45] }, duration: 1.4 }

/** Das heute noch offene Kästchen pulsiert. */
function PendingBox() {
  const ref = useLoop<HTMLSpanElement>(PULSE)
  return <span ref={ref} className={`block h-4 w-full border-2 ${BOX.pending}`} />
}
