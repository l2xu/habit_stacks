import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { BlockColor, ID } from '@/domain/types'
import { useToday } from '@/hooks/useToday'
import { useAppStore } from '@/store/useAppStore'
import { TextField } from '@/ui/controls'
import { PanelHeader } from '@/ui/PanelHeader'
import { PixelButton } from '@/ui/PixelButton'
import { BlockFields } from './BlockFields'
import { BlockPreview } from './BlockPreview'
import { draftToInput, draftValid, emptyDraft, nextColor, TOWER_NAME_MAX } from './blockDraft'

/** Neuer Turm: Name + Anker. Danach geht es direkt zum ersten gestapelten Block. */
export function NewTowerView({ onCreated, onClose }: { onCreated: (towerId: ID) => void; onClose: () => void }) {
  const today = useToday()
  const createTower = useAppStore((s) => s.createTower)
  // Anker-Farben der Insel – der neue Turm bekommt möglichst eine eigene.
  const anchorColors = useAppStore(
    useShallow((s) =>
      s.towerOrder.flatMap((id): BlockColor[] => {
        const color = s.habits[s.towers[id]?.blockIds[0] ?? '']?.color
        return color ? [color] : []
      }),
    ),
  )
  const [name, setName] = useState('')
  const [draft, setDraft] = useState(() => emptyDraft(nextColor(anchorColors)))
  const valid = name.trim().length > 0 && draftValid(draft)

  const submit = () => {
    if (!valid) return
    const id = createTower({ name, anchor: draftToInput(draft) }, today)
    if (id) onCreated(id)
  }

  return (
    <>
      <PanelHeader title="Neuer Turm" subtitle="Jeder Turm steht auf einem Anker: einer Gewohnheit, die du schon jeden Tag machst." onClose={onClose} />
      <div className="mt-4 grid gap-4">
        <TextField label="Name des Turms" value={name} onChange={setName} placeholder="z. B. Morgenroutine" maxLength={TOWER_NAME_MAX} />
        <BlockPreview block={{ id: 'preview', title: draft.title.trim() || 'Dein Anker', color: draft.color, visual: 'anchor', level: 0, doneToday: false }} />
        <BlockFields draft={draft} onChange={setDraft} title={{ label: 'Anker', placeholder: 'z. B. Kaffee kochen' }} onSubmit={submit} />
        <PixelButton variant="go" disabled={!valid} onClick={submit} className="h-12 text-[17px] font-semibold text-paper">
          Turm bauen
        </PixelButton>
      </div>
    </>
  )
}
