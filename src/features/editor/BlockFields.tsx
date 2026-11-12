import { FieldLabel, Segmented, Stepper, TextField } from '@/ui/controls'
import { ColorPicker } from './ColorPicker'
import { stepMinutes, TIMER_MINUTES, TITLE_MAX, type BlockDraft } from './blockDraft'

interface BlockFieldsProps {
  draft: BlockDraft
  onChange: (draft: BlockDraft) => void
  /** Ohne Titelfeld: bestehende Blöcke werden nicht umbenannt. */
  title?: { label: string; placeholder: string }
  onSubmit: () => void
}

const KINDS = [
  { value: 'check', label: 'Abhaken' },
  { value: 'timer', label: 'Timer' },
] as const

/** Titel (nur beim Anlegen), Farbe und Fokus-Aktion eines Blocks – für Anker, neue und bestehende Blöcke. */
export function BlockFields({ draft, onChange, title, onSubmit }: BlockFieldsProps) {
  const set = (patch: Partial<BlockDraft>) => onChange({ ...draft, ...patch })

  return (
    <div className="grid gap-4">
      {title && (
        <TextField label={title.label} value={draft.title} onChange={(t) => set({ title: t })} placeholder={title.placeholder} maxLength={TITLE_MAX} onEnter={onSubmit} />
      )}
      <div>
        <FieldLabel>Farbe</FieldLabel>
        <ColorPicker value={draft.color} onChange={(color) => set({ color })} />
      </div>
      <div>
        <FieldLabel>Im Fokus-Modus</FieldLabel>
        <div className="mt-1.5 flex items-center gap-2">
          <Segmented label="Art der Aufgabe" value={draft.kind} options={KINDS} onChange={(kind) => set({ kind })} className="flex-1" />
          {draft.kind === 'timer' && (
            <Stepper
              label="Timer-Dauer"
              value={`${draft.minutes} Min.`}
              canDec={draft.minutes > TIMER_MINUTES[0]}
              canInc={draft.minutes < TIMER_MINUTES.at(-1)!}
              onDec={() => set({ minutes: stepMinutes(draft.minutes, -1) })}
              onInc={() => set({ minutes: stepMinutes(draft.minutes, 1) })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
