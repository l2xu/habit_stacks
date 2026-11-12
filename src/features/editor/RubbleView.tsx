import { useShallow } from 'zustand/react/shallow'
import { canStack, formingBlocks } from '@/domain/editor'
import { stackStartDay } from '@/domain/engine'
import type { ID, ISODate, LostBlockVM } from '@/domain/types'
import { relativeDay } from '@/features/news/news'
import { BlockThumb } from '@/features/world/BlockThumb'
import { useToday } from '@/hooks/useToday'
import { useTowerVM } from '@/store/selectors'
import { useAppStore } from '@/store/useAppStore'
import { PanelHeader } from '@/ui/PanelHeader'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { RUBBLE } from '@/ui/sprites'
import { plainTitle, type EditorRoute } from './blockDraft'

function lostLabel(l: LostBlockVM, today: ISODate): string {
  const when = l.lostOn ? ` ${relativeDay(l.lostOn, today)}` : ''
  switch (l.reason) {
    case 'broken':
      return `Weggebrochen${when}${l.onDay ? `, an Tag ${l.onDay}` : ''}`
    case 'fallen':
      return `Abgefallen${when} (nicht erledigt)`
    case 'removed':
      return `Abgebaut${when}`
    case 'collapsed':
      return `Eingestürzt${when}`
  }
}

interface RubbleViewProps {
  towerId: ID
  onNavigate: (route: EditorRoute) => void
  onClose: () => void
}

/** Schutthaufen eines Turms: verlorene Blöcke, neuester zuerst – jeder lässt sich neu stapeln. */
export function RubbleView({ towerId, onNavigate, onClose }: RubbleViewProps) {
  const today = useToday()
  const vm = useTowerVM(towerId, today)
  const s = useAppStore(useShallow((st) => ({ towers: st.towers, habits: st.habits, rules: st.rules })))
  const restackBlock = useAppStore((st) => st.restackBlock)
  const showToast = useAppStore((st) => st.showToast)
  if (!vm) return null

  const ghost = formingBlocks(s, towerId)[0]
  const stackable = canStack(s, towerId)
  const restack = (l: LostBlockVM) => {
    const tomorrow = stackStartDay(s, towerId, today) > today
    if (!restackBlock(l.id, today)) return
    const left = s.rules.formationDays - l.headStart
    const from = tomorrow ? 'ab morgen ' : ''
    showToast(`${plainTitle(l.title)} liegt wieder oben – ${l.headStart ? `${from}noch ${left} Tage, dann ist er wieder fest.` : `${from}in ${left} Tagen ist er fest.`}`)
    onClose()
  }

  return (
    <>
      <PanelHeader
        title="Schutthaufen"
        subtitle={`${vm.name}: Hier landen Blöcke, die weggebrochen, abgefallen oder abgebaut sind. Früher feste Blöcke starten beim Neu-Stapeln mit Bonus.`}
        onBack={() => onNavigate({ kind: 'tower', towerId })}
        onClose={onClose}
      />

      {vm.lost.length === 0 ? (
        <div className="mt-6 mb-2 flex flex-col items-center gap-3 text-center">
          <PixelIcon sprite={RUBBLE} px={4} />
          <p className="text-[16px] text-ink-soft">Noch nichts verloren. Weiter so!</p>
        </div>
      ) : (
        <>
          {vm.pausedSince ? (
            <p className="mt-4 px-frame px-gold px-3 py-2 text-[14px] leading-snug">
              {vm.name} ist pausiert. Erst nach dem Fortsetzen kannst du von hier wieder etwas stapeln.
            </p>
          ) : (
            !stackable &&
            ghost && (
              <p className="mt-4 px-frame px-gold px-3 py-2 text-[14px] leading-snug">
                Erst wenn „{plainTitle(ghost.title)}“ verfestigt ist, kannst du von hier wieder etwas stapeln.
              </p>
            )
          )}
          <ul className="mt-4 grid gap-1.5">
            {vm.lost.map((l) => (
              <li key={l.id} className="px-frame flex items-center gap-2.5 py-1.5 pr-1.5 pl-2">
                <BlockThumb color={l.color} size={36} className="opacity-70 grayscale-[35%]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] leading-tight font-semibold">{plainTitle(l.title)}</span>
                  <span className="block text-[13px] leading-tight text-ink-soft">
                    {lostLabel(l, today)}
                    {l.headStart > 0 && ` · startet mit ${l.headStart}/${s.rules.formationDays}`}
                  </span>
                </span>
                <PixelButton disabled={!stackable} onClick={() => restack(l)} className="h-10 shrink-0 px-3 text-[15px] font-semibold">
                  Neu stapeln
                </PixelButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
