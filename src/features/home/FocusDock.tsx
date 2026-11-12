import type { TowerVM } from '@/domain/types'
import { actionLabel, plainTitle } from '@/features/editor/blockDraft'
import { BlockThumb } from '@/features/world/BlockThumb'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { CHECK, HOURGLASS, LOCK, PLAY } from '@/ui/sprites'

interface FocusDockProps {
  tower: TowerVM
  onStart: () => void
  /** Pausierter Turm: „Fortsetzen“ statt „Start“. */
  onResume: () => void
}

/**
 * Einstieg in den Fokus-Modus am unteren Rand: zeigt den nächsten offenen Block,
 * "Start" öffnet die Fokus-Ansicht. Ist der Turm pausiert, steht dort das Schloss mit „Fortsetzen“.
 */
export function FocusDock({ tower, onStart, onResume }: FocusDockProps) {
  const next = tower.nextBlock
  // Ein Geist, der erst morgen startet, gehört heute nicht zur Routine.
  const today = tower.blocks.filter((b) => !b.upcoming)
  const doneCount = today.filter((b) => b.doneToday).length
  if (tower.pausedSince) return <PausedDock name={tower.name} onResume={onResume} />

  return (
    <section className="flex h-(--dock-h) flex-col justify-end px-3 pb-[calc(var(--safe-bottom)+12px)]" aria-label="Fokus-Modus">
      <div className="px-frame px-tab relative z-0 -mb-[3px] self-start px-3.5 pt-1.5 pb-2 text-[15px] leading-none font-semibold text-paper">
        Fokus-Modus
      </div>
      <div className="px-frame pointer-events-auto relative z-10 flex items-center gap-3 py-3 pr-3 pl-3.5">
        {next ? <BlockThumb color={next.color} /> : <PixelIcon sprite={CHECK} px={4} className="mx-1.5" />}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-none font-bold tracking-wide text-ink-soft uppercase">
            {next ? 'Als Nächstes' : tower.name}
          </p>
          <p className="mt-1 truncate text-[20px] leading-tight font-semibold">
            {next ? plainTitle(next.title) : 'Heute komplett gestapelt'}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[13px] leading-none text-ink-soft">
            {next && (
              <span className="flex items-center gap-1">
                <PixelIcon sprite={next.action.kind === 'timer' ? HOURGLASS : CHECK} px={1.5} />
                {actionLabel(next.action)}
              </span>
            )}
            <ChainProgress done={doneCount} total={today.length} />
          </div>
        </div>
        {next && (
          <PixelButton variant="go" onClick={onStart} className="h-12 shrink-0 gap-2 px-4 text-[17px] font-semibold text-paper">
            <PixelIcon sprite={PLAY} px={2} />
            Start
          </PixelButton>
        )}
      </div>
    </section>
  )
}

function PausedDock({ name, onResume }: { name: string; onResume: () => void }) {
  return (
    <section className="flex h-(--dock-h) flex-col justify-end px-3 pb-[calc(var(--safe-bottom)+12px)]" aria-label="Pause">
      <div className="px-frame px-tab relative z-0 -mb-[3px] self-start px-3.5 pt-1.5 pb-2 text-[15px] leading-none font-semibold text-paper">
        Pausiert
      </div>
      <div className="px-frame pointer-events-auto relative z-10 flex items-center gap-3 py-3 pr-3 pl-3.5">
        <PixelIcon sprite={LOCK} px={4} className="mx-1" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-none font-bold tracking-wide text-ink-soft uppercase">{name}</p>
          <p className="mt-1 text-[15px] leading-snug">Nichts bröckelt, nichts bricht weg.</p>
        </div>
        <PixelButton variant="go" onClick={onResume} className="h-12 shrink-0 gap-2 px-4 text-[17px] font-semibold text-paper">
          <PixelIcon sprite={PLAY} px={2} />
          Fortsetzen
        </PixelButton>
      </div>
    </section>
  )
}

/** Kette der Routine: ein Kästchen pro Block, gefüllt = heute erledigt. */
function ChainProgress({ done, total }: { done: number; total: number }) {
  return (
    <span className="flex items-center gap-[3px]" role="img" aria-label={`${done} von ${total} Blöcken erledigt`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`size-[7px] border-[1.5px] border-ink/70 ${i < done ? 'bg-ink/70' : ''}`} />
      ))}
    </span>
  )
}
