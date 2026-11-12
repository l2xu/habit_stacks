import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { canMoveBlock, canStack, formingBlocks } from '@/domain/editor'
import type { BlockVM, Habit, ID, ISODate, TowerVM } from '@/domain/types'
import { pausedLabel } from '@/features/news/news'
import { TowerNotifySection } from '@/features/notify/TowerNotifySection'
import { BlockThumb } from '@/features/world/BlockThumb'
import { useToday } from '@/hooks/useToday'
import { useTowerVM } from '@/store/selectors'
import { useAppStore } from '@/store/useAppStore'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { FieldLabel, Section, SettingRow, TextField } from '@/ui/controls'
import { PanelHeader } from '@/ui/PanelHeader'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { ARROW, LOCK, PLUS, RUBBLE } from '@/ui/sprites'
import { actionLabel, plainTitle, TOWER_NAME_MAX, type EditorRoute } from './blockDraft'

interface TowerViewProps {
  towerId: ID
  onNavigate: (route: EditorRoute) => void
  onClose: () => void
}

/**
 * Übersicht eines Turms: Name, Blöcke (oben → unten), Stapeln, Position, Schutthaufen, Pausieren, Löschen.
 * Pausiert ist alles gesperrt – dann gibt es nur die Blöcke zum Ansehen und „Fortsetzen“.
 */
export function TowerView({ towerId, onNavigate, onClose }: TowerViewProps) {
  const today = useToday()
  const liveVm = useTowerVM(towerId, today)
  const liveS = useAppStore(useShallow((st) => ({ towers: st.towers, towerOrder: st.towerOrder, habits: st.habits, rules: st.rules })))
  const actions = useAppStore(
    useShallow((st) => ({
      renameTower: st.renameTower,
      moveTower: st.moveTower,
      moveBlock: st.moveBlock,
      deleteTower: st.deleteTower,
      pauseTower: st.pauseTower,
      resumeTower: st.resumeTower,
      showToast: st.showToast,
    })),
  )
  // Nach dem Löschen bleibt der letzte Stand stehen, solange das Sheet ausfährt.
  const [deleted, setDeleted] = useState<{ vm: TowerVM; s: typeof liveS } | null>(null)
  const vm = deleted?.vm ?? liveVm
  const s = deleted?.s ?? liveS
  const [name, setName] = useState(() => vm?.name ?? '')
  if (!vm) return null

  if (vm.pausedSince) {
    return (
      <PausedTowerView
        vm={vm}
        habits={s.habits}
        today={today}
        onResume={() => {
          actions.resumeTower(towerId, today)
          actions.showToast(`${vm.name} läuft wieder – ab heute zählt jeder Tag.`)
        }}
        onClose={onClose}
      />
    )
  }

  const ghost = formingBlocks(s, towerId)[0]
  const stackable = canStack(s, towerId)
  const position = s.towerOrder.indexOf(towerId)
  // Pfeile nur, wenn es überhaupt etwas zu tauschen gibt (mindestens zwei Blöcke über dem Anker).
  const sortable = vm.blocks.filter((b) => b.visual !== 'anchor').length > 1

  return (
    <>
      <PanelHeader title={vm.name} subtitle="Turm bearbeiten" onClose={onClose} />

      <div className="mt-4">
        <TextField
          label="Name"
          value={name}
          onChange={(v) => {
            setName(v)
            actions.renameTower(towerId, v)
          }}
          onBlur={() => setName(vm.name)}
          maxLength={TOWER_NAME_MAX}
        />
      </div>

      <div className="mt-4">
        <FieldLabel>Blöcke · {vm.blocks.length}</FieldLabel>
        {stackable ? (
          <PixelButton
            variant="go"
            onClick={() => onNavigate({ kind: 'new-block', towerId })}
            className="mt-1.5 h-12 w-full gap-2 text-[16px] font-semibold text-paper"
          >
            <PixelIcon sprite={PLUS} px={1.5} colors={{ X: '#f4f2e8' }} />
            Neuen Block oben draufstapeln
          </PixelButton>
        ) : (
          ghost && (
            <p className="mt-1.5 px-frame px-gold px-3 py-2 text-[14px] leading-snug">
              „{plainTitle(ghost.title)}“ verfestigt sich noch. Danach passt der nächste Block drauf – immer eine neue Gewohnheit nach der anderen.
            </p>
          )
        )}
        <ol className="mt-2 grid gap-1.5">
          {vm.blocks.toReversed().map((b) => {
            const habit = s.habits[b.id]
            if (!habit) return null
            return (
              <BlockRow
                key={b.id}
                block={b}
                habit={habit}
                sortable={sortable && b.visual !== 'anchor'}
                canUp={canMoveBlock(s, b.id, 1)}
                canDown={canMoveBlock(s, b.id, -1)}
                onMove={(dir) => actions.moveBlock(b.id, dir)}
                onOpen={() => onNavigate({ kind: 'edit-block', towerId, habitId: b.id })}
              />
            )
          })}
        </ol>
      </div>

      <button
        type="button"
        onClick={() => onNavigate({ kind: 'rubble', towerId })}
        className="px-frame px-button mt-4 flex w-full items-center gap-3 py-2.5 pr-3 pl-3.5 text-left"
      >
        <PixelIcon sprite={RUBBLE} px={2.5} />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] leading-tight font-semibold">Schutthaufen</span>
          <span className="block text-[13px] leading-snug text-ink-soft">
            {vm.lost.length === 0 ? 'Leer – noch nichts verloren.' : `${vm.lost.length} ${vm.lost.length === 1 ? 'Block' : 'Blöcke'}, neu stapeln möglich`}
          </span>
        </span>
        <PixelIcon sprite={ARROW} px={2} className="rotate-90" />
      </button>

      <TowerNotifySection towerId={towerId} />

      <Section title="Turm">
        {s.towerOrder.length > 1 && (
          <SettingRow label="Platz auf der Insel" hint={`${position + 1} von ${s.towerOrder.length}`}>
            <div className="flex gap-1.5">
              <PixelButton aria-label="Nach links" disabled={position === 0} onClick={() => actions.moveTower(towerId, -1)} className="size-11">
                <PixelIcon sprite={ARROW} px={2} className="-rotate-90" />
              </PixelButton>
              <PixelButton
                aria-label="Nach rechts"
                disabled={position === s.towerOrder.length - 1}
                onClick={() => actions.moveTower(towerId, 1)}
                className="size-11"
              >
                <PixelIcon sprite={ARROW} px={2} className="rotate-90" />
              </PixelButton>
            </div>
          </SettingRow>
        )}
        <SettingRow
          label="Pausieren"
          hint="Für Urlaub und Co.: Der Turm ruht mit Schloss auf der Insel, nichts geht verloren. Bis zum Fortsetzen ist er gesperrt."
        >
          <PixelButton
            onClick={() => {
              actions.pauseTower(towerId, today)
              actions.showToast(`${vm.name} ist pausiert.`)
            }}
            className="h-10 w-28 shrink-0 text-[15px] font-semibold"
          >
            Pausieren
          </PixelButton>
        </SettingRow>
        <SettingRow label="Turm löschen" hint="Mit allen Blöcken, dem Schutthaufen und der Historie. Lässt sich nicht rückgängig machen.">
          <ConfirmButton
            danger
            disabled={!!deleted}
            onConfirm={() => {
              setDeleted({ vm, s })
              actions.deleteTower(towerId)
              actions.showToast(`${vm.name} gelöscht.`)
              onClose()
            }}
          >
            Löschen
          </ConfirmButton>
        </SettingRow>
      </Section>
    </>
  )
}

interface PausedTowerViewProps {
  vm: TowerVM
  habits: Record<ID, Habit>
  today: ISODate
  onResume: () => void
  onClose: () => void
}

/** Pausierter Turm: Schloss, Blöcke nur zum Ansehen, „Fortsetzen“ ist die einzige Aktion. */
function PausedTowerView({ vm, habits, today, onResume, onClose }: PausedTowerViewProps) {
  return (
    <>
      <PanelHeader title={vm.name} subtitle={vm.pausedSince ? pausedLabel(vm.pausedSince, today) : undefined} onClose={onClose} />

      <div className="mt-4 px-frame flex items-center gap-3 py-3 pr-3 pl-3.5">
        <PixelIcon sprite={LOCK} px={3} className="shrink-0" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug">
          Nichts bröckelt, nichts bricht weg. Bearbeiten und Abhaken gehen erst wieder nach dem Fortsetzen.
        </p>
      </div>
      <PixelButton variant="go" onClick={onResume} className="mt-2 h-12 w-full text-[17px] font-semibold text-paper">
        Fortsetzen
      </PixelButton>

      <div className="mt-4">
        <FieldLabel>Blöcke · {vm.blocks.length}</FieldLabel>
        <ol className="mt-1.5 grid gap-1.5">
          {vm.blocks.toReversed().map((b) => {
            const habit = habits[b.id]
            return habit ? <BlockRow key={b.id} block={b} habit={habit} sortable={false} canUp={false} canDown={false} /> : null
          })}
        </ol>
      </div>
    </>
  )
}

function blockStatus(b: BlockVM, habit: Habit): string {
  switch (b.visual) {
    case 'anchor':
      return `Anker · ${actionLabel(habit.action)}`
    case 'forming':
      if (b.upcoming) return `Geist · startet morgen`
      return b.wobbling ? `Wackelt · ${b.stones}/${b.formationTarget}` : `Geist · ${b.stones}/${b.formationTarget} Tage`
    case 'crumbling':
      return `Bröckelt · ${b.skips}× nicht erledigt`
    case 'solid':
      return b.skips ? `${actionLabel(habit.action)} · ${b.skips}× nicht erledigt` : actionLabel(habit.action)
  }
}

interface BlockRowProps {
  block: BlockVM
  habit: Habit
  sortable: boolean
  canUp: boolean
  canDown: boolean
  onMove?: (dir: 1 | -1) => void
  /** Fehlt bei einem pausierten Turm: Die Zeile ist dann nur zum Ansehen. */
  onOpen?: () => void
}

function BlockRow({ block, habit, sortable, canUp, canDown, onMove, onOpen }: BlockRowProps) {
  const title = plainTitle(block.title)
  const content = (
    <>
      <BlockThumb color={block.color} size={36} className={block.visual === 'forming' ? 'opacity-55' : ''} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-tight font-semibold">{title}</span>
        <span
          className={`block truncate text-[13px] leading-tight ${block.visual === 'crumbling' || block.wobbling ? 'font-semibold text-brick' : 'text-ink-soft'}`}
        >
          {blockStatus(block, habit)}
        </span>
      </span>
    </>
  )

  return (
    <li className="px-frame flex items-center gap-1.5 py-1 pr-1.5 pl-2">
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={`${title} bearbeiten`} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
          {content}
        </button>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5">{content}</div>
      )}
      {sortable && (
        <>
          <PixelButton aria-label={`${title} nach oben`} disabled={!canUp} onClick={() => onMove?.(1)} className="size-10">
            <PixelIcon sprite={ARROW} px={1.5} />
          </PixelButton>
          <PixelButton aria-label={`${title} nach unten`} disabled={!canDown} onClick={() => onMove?.(-1)} className="size-10">
            <PixelIcon sprite={ARROW} px={1.5} className="rotate-180" />
          </PixelButton>
        </>
      )}
    </li>
  )
}
