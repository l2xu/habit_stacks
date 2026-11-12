import type { FocusStep, FocusStepStatus, TowerVM } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import { BlockThumb } from '@/features/world/BlockThumb'

const STATUS_LABEL: Record<FocusStepStatus, string> = {
  pending: 'offen',
  active: 'jetzt aktiv',
  done: 'erledigt',
  skipped: 'übersprungen',
}

/** Die Kette der Routine von unten (links) nach oben (rechts). */
export function ChainStrip({ tower, steps }: { tower: TowerVM; steps: FocusStep[] }) {
  return (
    <ol className="flex items-end gap-0.5" aria-label="Kette der Routine">
      {steps.map((step) => {
        const block = tower.blocks.find((b) => b.id === step.habitId)
        if (!block) return null
        const active = step.status === 'active'
        return (
          <li key={step.habitId} className="relative">
            <BlockThumb
              color={block.color}
              size={active ? 34 : 24}
              className={step.status === 'pending' ? 'opacity-55' : step.status === 'skipped' ? 'opacity-30 grayscale' : ''}
            />
            {step.status === 'done' && (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 border-[1.5px] border-[#3f5a33] bg-[#cfdcae]" aria-hidden />
            )}
            <span className="sr-only">
              {plainTitle(block.title)}: {STATUS_LABEL[step.status]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
