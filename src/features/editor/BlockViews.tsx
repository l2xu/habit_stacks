import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { canDiscard, canStack } from '@/domain/editor'
import { stackStartDay } from '@/domain/engine'
import type { ID } from '@/domain/types'
import { relativeDay } from '@/features/news/news'
import { useToday } from '@/hooks/useToday'
import { useTowerVM } from '@/store/selectors'
import { sfx } from '@/store/sfx'
import { useAppStore } from '@/store/useAppStore'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { Section, SettingRow } from '@/ui/controls'
import { PanelHeader } from '@/ui/PanelHeader'
import { PixelButton } from '@/ui/PixelButton'
import { BlockFields } from './BlockFields'
import { BlockPreview } from './BlockPreview'
import { draftFrom, draftToInput, draftValid, emptyDraft, nextColor, plainTitle, type EditorRoute } from './blockDraft'

interface ViewProps {
  towerId: ID
  onNavigate: (route: EditorRoute) => void
  onClose: () => void
}

/**
 * Neuen Geister-Block stapeln. Die Formel nach James Clear macht den Auslöser sichtbar:
 * „Nach [oberster Block] werde ich [neue Gewohnheit].“
 */
export function NewBlockView({ towerId, first, onNavigate, onClose }: ViewProps & { first?: boolean }) {
  const today = useToday()
  const vm = useTowerVM(towerId, today)
  const s = useAppStore(useShallow((st) => ({ towers: st.towers, habits: st.habits, rules: st.rules })))
  const stackBlock = useAppStore((st) => st.stackBlock)
  const showToast = useAppStore((st) => st.showToast)
  const [draft, setDraft] = useState(() => emptyDraft(nextColor(vm?.blocks.map((b) => b.color) ?? [])))
  const cue = vm?.blocks.at(-1)
  if (!vm || !cue) return null

  const { formationDays } = s.rules
  const valid = draftValid(draft) && canStack(s, towerId)
  const back = () => onNavigate({ kind: 'tower', towerId })
  const submit = () => {
    if (!valid || !stackBlock(towerId, draftToInput(draft), today)) return
    sfx('land')
    const tomorrow = stackStartDay(s, towerId, today) > today
    showToast(`${draft.title.trim()} gestapelt – ${tomorrow ? 'ab morgen zählt jeder Tag, ' : ''}in ${formationDays} Tagen ist er fest.`)
    onClose()
  }

  return (
    <>
      <PanelHeader
        title={first ? 'Erste Gewohnheit stapeln' : 'Block stapeln'}
        subtitle={first ? `${vm.name} steht. Was machst du direkt nach deinem Anker?` : vm.name}
        onBack={first ? undefined : back}
        onClose={onClose}
      />
      <div className="mt-4 grid gap-4">
        <p className="text-[17px] leading-snug">
          Nach <strong className="font-semibold">„{plainTitle(cue.title)}“</strong> werde ich …
        </p>
        <BlockPreview
          block={{
            id: 'preview',
            title: draft.title.trim() || 'Neue Gewohnheit',
            color: draft.color,
            visual: 'forming',
            level: 1,
            doneToday: false,
            stones: 0,
            formationTarget: formationDays,
          }}
        />
        <BlockFields draft={draft} onChange={setDraft} title={{ label: 'Neue Gewohnheit', placeholder: 'z. B. 10 Min. lesen' }} onSubmit={submit} />
        <p className="text-[13px] leading-snug text-ink-soft">
          Neue Blöcke starten als Geist. Jeder erledigte Tag bringt einen Würfel, bis der Geist voll ist. Am {formationDays}. erledigten Tag wird der Block fest. Einen Tag
          verpassen ist okay – zweimal hintereinander nicht.
        </p>
        <PixelButton variant="go" disabled={!valid} onClick={submit} className="h-12 text-[17px] font-semibold text-paper">
          Stapeln
        </PixelButton>
        {first && (
          <PixelButton onClick={onClose} className="h-11 text-[16px] font-semibold">
            Später
          </PixelButton>
        )}
      </div>
    </>
  )
}

/**
 * Block bearbeiten: Farbe und Aktion. Der Titel bleibt fest – eine andere Gewohnheit ist ein neuer Block.
 * Darunter Abbauen (→ Schutthaufen) bzw. spurlos löschen.
 */
export function EditBlockView({ towerId, habitId, onNavigate, onClose }: ViewProps & { habitId: ID }) {
  const today = useToday()
  const vm = useTowerVM(towerId, today)
  const habit = useAppStore((st) => st.habits[habitId])
  const events = useAppStore((st) => st.events)
  const formationDays = useAppStore((st) => st.rules.formationDays)
  const actions = useAppStore(
    useShallow((st) => ({ updateBlock: st.updateBlock, removeBlock: st.removeBlock, discardBlock: st.discardBlock, showToast: st.showToast })),
  )
  const [draft, setDraft] = useState(() => (habit ? draftFrom(habit) : emptyDraft('slate')))
  const block = vm?.blocks.find((b) => b.id === habitId)
  if (!habit || !block) return null

  const back = () => onNavigate({ kind: 'tower', towerId })
  const { color, action } = draftToInput(draft)
  const valid = color !== habit.color || JSON.stringify(action) !== JSON.stringify(habit.action)
  const title = plainTitle(habit.title)
  const isAnchor = habit.role === 'anchor'
  const discardable = canDiscard({ habits: { [habitId]: habit }, events }, habitId, today)

  const save = () => {
    if (!valid || !actions.updateBlock(habitId, { color, action })) return
    actions.showToast('Gespeichert.')
    back()
  }

  const status =
    block.visual === 'anchor'
      ? 'Anker – bricht nie und zerfällt nie.'
      : block.visual === 'forming'
        ? block.upcoming
          ? `Geist · startet morgen – ab dann zählt jeder Tag (${block.stones} von ${formationDays})`
          : block.wobbling
          ? `Wackelt – gestern verpasst, heute erledigen! (Tag ${block.stones} von ${formationDays})`
          : `Geist · Tag ${block.stones} von ${formationDays}`
        : block.visual === 'crumbling'
          ? `Bröckelt – ${block.skips} Tage in Folge nicht erledigt. ${block.fallIn === 1 ? 'Fehlt er heute, fällt er morgen ab.' : 'Erledige ihn heute, dann steht er wieder.'}`
          : block.skips
            ? 'Zuletzt nicht erledigt – fehlt er heute wieder, bröckelt er.'
            : habit.formation?.solidifiedOn
              ? `Verfestigt ${relativeDay(habit.formation.solidifiedOn, today)}`
              : 'Verfestigt'

  return (
    <>
      <PanelHeader title={title} subtitle={status} onBack={back} onClose={onClose} />
      <div className="mt-4 grid gap-4">
        <BlockPreview
          block={{ ...block, color: draft.color, level: isAnchor ? 0 : 1, visual: block.visual === 'crumbling' ? 'solid' : block.visual }}
        />
        <BlockFields draft={draft} onChange={setDraft} onSubmit={save} />
        <PixelButton variant="go" disabled={!valid} onClick={save} className="h-12 text-[17px] font-semibold text-paper">
          Speichern
        </PixelButton>
      </div>

      <Section title="Entfernen">
        {isAnchor ? (
          <p className="text-[14px] leading-snug text-ink-soft">Der Anker trägt den Turm und bleibt immer stehen. Um ihn loszuwerden, lösche den ganzen Turm.</p>
        ) : discardable ? (
          <SettingRow label="Löschen" hint="Heute gestapelt – verschwindet spurlos, ohne Schutthaufen. Praktisch bei einem Tippfehler: löschen und neu stapeln.">
            <ConfirmButton
              danger
              onConfirm={() => {
                actions.discardBlock(habitId, today)
                actions.showToast(`${title} gelöscht.`)
                back()
              }}
            >
              Löschen
            </ConfirmButton>
          </SettingRow>
        ) : (
          <SettingRow
            label="Abbauen"
            hint={
              block.visual === 'forming'
                ? 'Kommt auf den Schutthaufen. Von dort kannst du ihn neu stapeln – dann sammelt er seine Würfel von vorn.'
                : 'Kommt auf den Schutthaufen. Von dort kannst du ihn neu stapeln – als früher fester Block startet er mit Bonus-Würfeln.'
            }
          >
            <ConfirmButton
              danger
              onConfirm={() => {
                actions.removeBlock(habitId, today)
                actions.showToast(`${title} liegt auf dem Schutthaufen.`)
                back()
              }}
            >
              Abbauen
            </ConfirmButton>
          </SettingRow>
        )}
      </Section>
    </>
  )
}
