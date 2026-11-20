import type { TowerVM } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import { PixelIcon } from '@/ui/PixelIcon'
import { WARN } from '@/ui/sprites'

/** Höhe der Warnzeile und der Countdown-Zeile darunter – die Kamera rechnet damit. */
const RISK_H = 32
const FALL_LINE_H = 18

/** Was heute verloren gehen kann – das Schlimmste zuerst; null = alles sicher (oder pausiert). */
function riskLine(tower: TowerVM): string | null {
  if (tower.pausedSince) return null
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

/** Platz, den die Warnung unter der Kopfzeile braucht (0 = keine Warnung). */
export function riskHeight(tower: TowerVM | null): number {
  if (!tower || !riskLine(tower)) return 0
  return RISK_H + (fallLine(tower) ? FALL_LINE_H : 0)
}

/**
 * Warnung unter der Kopfzeile der Detailansicht – nur, wenn heute etwas verloren gehen kann: ein Block bröckelt oder
 * ein Geist wackelt, dazu der Countdown. Der Streak steht unten in der Leiste.
 */
export function RiskBanner({ tower }: { tower: TowerVM }) {
  const risk = riskLine(tower)
  const fall = fallLine(tower)
  if (!risk) return null

  return (
    <section className="px-4 pt-3" aria-label={`Warnung für ${tower.name}`}>
      <h2 className="flex items-center gap-2 text-[17px] leading-none font-semibold text-brick">
        <PixelIcon sprite={WARN} px={1.5} className="shrink-0" />
        <span className="truncate">{risk}</span>
      </h2>
      {fall && <p className="mt-1 truncate pl-[22px] text-[13px] leading-[14px] text-ink-soft">{fall}</p>}
    </section>
  )
}
