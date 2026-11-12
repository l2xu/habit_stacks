import { create } from 'zustand'
import * as editor from '@/domain/editor'
import type { BlockInput, BlockPatch, Dir, TowerInput } from '@/domain/editor'
import { evaluateAll, solidifyOnCompletion } from '@/domain/engine'
import {
  completeActiveStep,
  createFocusSession,
  resumableFocus,
  skipActiveStep,
  timerPause,
  timerStart,
  updateActiveTimer,
} from '@/domain/focus'
import { newId } from '@/domain/id'
import { createEmptyState, pickDomain } from '@/domain/state'
import type { AppSettings, DomainState, FocusSession, ID, ISODate, TowerEvent, TowerNotify } from '@/domain/types'

/** Flüchtiger UI-Zustand – wird nicht persistiert. */
export interface UiState {
  /** false, bis der gespeicherte Zustand geladen und ausgewertet ist. */
  hydrated: boolean
  selectedTowerId: ID | null
  /** Insel-Übersicht oder Detailansicht des ausgewählten Turms. */
  view: 'overview' | 'tower'
  toast: { id: number; text: string } | null
  storage: { driver: string; lastSavedAt: number | null; error: string | null }
}

export interface AppActions {
  /** Kamera fährt auf den Turm (Detailansicht). */
  openTower: (id: ID) => void
  showOverview: () => void
  showToast: (text: string) => void
  dismissToast: () => void

  // Daten & Regeln
  /** Ersetzt den kompletten Zustand (Laden, Import, Demo, Löschen) und wertet ihn für heute aus. */
  replaceDomain: (domain: DomainState, today: ISODate) => void
  /** Wertet alle abgeschlossenen Tage bis gestern aus (beim Start und bei jedem Tageswechsel). */
  evaluate: (today: ISODate) => void
  markEventsSeen: (ids: ID[]) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  setStorageInfo: (info: Partial<UiState['storage']>) => void

  // Fokus-Modus
  startFocus: (towerId: ID, date: ISODate) => void
  completeStep: () => void
  skipStep: () => void
  startTimer: () => void
  pauseTimer: () => void
  closeFocus: () => void

  // Editor – Logik in domain/editor.ts. Rückgabe: ob sich etwas geändert hat bzw. die neue ID.
  createTower: (input: TowerInput, today: ISODate) => ID | null
  renameTower: (towerId: ID, name: string) => boolean
  moveTower: (towerId: ID, dir: Dir) => boolean
  deleteTower: (towerId: ID) => boolean
  pauseTower: (towerId: ID, today: ISODate) => boolean
  resumeTower: (towerId: ID, today: ISODate) => boolean
  setTowerNotify: (towerId: ID, notify: TowerNotify) => boolean
  stackBlock: (towerId: ID, input: BlockInput, today: ISODate) => ID | null
  updateBlock: (habitId: ID, patch: BlockPatch) => boolean
  moveBlock: (habitId: ID, dir: Dir) => boolean
  removeBlock: (habitId: ID, today: ISODate) => boolean
  discardBlock: (habitId: ID, today: ISODate) => boolean
  restackBlock: (habitId: ID, today: ISODate) => boolean
}

export type AppStore = DomainState & { ui: UiState } & AppActions

/** Event "Routine abgeschlossen" – gilt sofort als gesehen, weil die Fokus-Ansicht ihn selbst feiert. */
function completionEvent(session: FocusSession, nowMs: number): TowerEvent {
  const now = new Date(nowMs).toISOString()
  return {
    id: newId(),
    towerId: session.towerId,
    type: 'routine_completed',
    sessionId: session.id,
    date: session.date,
    createdAt: now,
    seenAt: now,
  }
}

/** Engine laufen lassen und eine veraltete Fokus-Session verwerfen. */
function settle(domain: DomainState, today: ISODate): DomainState {
  const evaluated = evaluateAll(domain, today)
  const focus = resumableFocus(evaluated.focus, today)
  return focus === evaluated.focus ? evaluated : { ...evaluated, focus }
}

// Startet leer; persistence.ts lädt den gespeicherten Zustand (oder legt die Demo-Insel an).
export const useAppStore = create<AppStore>()((set, get) => {
  /** Wendet eine Editor-Funktion an; gibt sie dieselbe Referenz zurück, bleibt der Store unverändert. */
  const apply = (fn: (domain: DomainState) => DomainState, ui?: (s: AppStore) => Partial<UiState>): boolean => {
    const domain = pickDomain(get())
    const next = fn(domain)
    if (next === domain) return false
    set((s) => (ui ? { ...next, ui: { ...s.ui, ...ui(s) } } : next))
    return true
  }

  return {
    ...createEmptyState(),
    ui: {
      hydrated: false,
      selectedTowerId: null,
      view: 'overview',
      toast: null,
      storage: { driver: '–', lastSavedAt: null, error: null },
    },

    openTower: (id) => set((s) => ({ ui: { ...s.ui, selectedTowerId: id, view: 'tower' } })),
    showOverview: () => set((s) => ({ ui: { ...s.ui, view: 'overview' } })),
    showToast: (text) => set((s) => ({ ui: { ...s.ui, toast: { id: Date.now(), text } } })),
    dismissToast: () => set((s) => ({ ui: { ...s.ui, toast: null } })),

    replaceDomain: (domain, today) =>
      set((s) => {
        const next = settle(domain, today)
        const selected = s.ui.selectedTowerId && next.towers[s.ui.selectedTowerId] ? s.ui.selectedTowerId : next.towerOrder[0] ?? null
        return { ...next, ui: { ...s.ui, hydrated: true, selectedTowerId: selected, view: 'overview' } }
      }),

    evaluate: (today) =>
      set((s) => {
        const domain = pickDomain(s)
        const next = settle(domain, today)
        return next === domain ? {} : next
      }),

    markEventsSeen: (ids) =>
      set((s) => {
        const now = new Date().toISOString()
        const wanted = new Set(ids)
        return { events: s.events.map((e) => (wanted.has(e.id) && !e.seenAt ? { ...e, seenAt: now } : e)) }
      }),

    updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    setStorageInfo: (info) => set((s) => ({ ui: { ...s.ui, storage: { ...s.ui.storage, ...info } } })),

    startFocus: (towerId, date) =>
      set((s) => {
        const tower = s.towers[towerId]
        // Pausierte Türme lassen sich nicht abhaken.
        if (!tower || tower.pausedSince || s.focus?.state === 'running') return {}
        const focus = createFocusSession(towerId, tower.blockIds, s.habits, s.logs, date, Date.now())
        return focus ? { focus } : {}
      }),

    completeStep: () =>
      set((s) => {
        const step = s.focus?.state === 'running' ? s.focus.steps[s.focus.activeIndex] : undefined
        const habit = step && s.habits[step.habitId]
        if (!s.focus || !habit) return {}
        const now = Date.now()
        const { session, log } = completeActiveStep(s.focus, habit, now)
        const logs = { ...s.logs, [`${log.habitId}|${log.date}`]: log }
        // Der letzte fehlende Tag eines Geists macht ihn sofort fest – die Neuigkeit kommt nach dem Fokus-Modus.
        const { habits, events } = solidifyOnCompletion({ ...pickDomain(s), logs }, habit.id, log.date, now)
        return {
          focus: session,
          logs,
          habits,
          events: session.state === 'completed' ? [...events, completionEvent(session, now)] : events,
        }
      }),

    skipStep: () =>
      set((s) => {
        if (s.focus?.state !== 'running') return {}
        const now = Date.now()
        const focus = skipActiveStep(s.focus, now)
        return {
          focus,
          events: focus.state === 'completed' ? [...s.events, completionEvent(focus, now)] : s.events,
        }
      }),

    startTimer: () =>
      set((s) => (s.focus?.state === 'running' ? { focus: updateActiveTimer(s.focus, (t) => timerStart(t, Date.now())) } : {})),
    pauseTimer: () =>
      set((s) => (s.focus?.state === 'running' ? { focus: updateActiveTimer(s.focus, (t) => timerPause(t, Date.now())) } : {})),

    // Abbrechen verliert nichts: Erledigte Schritte stehen bereits als Logs im Zustand.
    closeFocus: () => set({ focus: null }),

    createTower: (input, today) => {
      const ids = { tower: newId(), anchor: newId() }
      const ok = apply((d) => editor.createTower(d, input, today, Date.now(), ids), () => ({ selectedTowerId: ids.tower, view: 'tower' }))
      return ok ? ids.tower : null
    },
    renameTower: (towerId, name) => apply((d) => editor.renameTower(d, towerId, name)),
    moveTower: (towerId, dir) => apply((d) => editor.moveTower(d, towerId, dir)),
    deleteTower: (towerId) => {
      // Auswahl wandert zum Nachbarn auf der Insel.
      const order = get().towerOrder
      const rest = order.filter((id) => id !== towerId)
      const neighbor = rest[Math.min(order.indexOf(towerId), rest.length - 1)] ?? null
      return apply(
        (d) => editor.deleteTower(d, towerId),
        (s) => (s.ui.selectedTowerId === towerId ? { selectedTowerId: neighbor, view: 'overview' } : {}),
      )
    },
    pauseTower: (towerId, today) => apply((d) => editor.pauseTower(d, towerId, today)),
    resumeTower: (towerId, today) => apply((d) => editor.resumeTower(d, towerId, today)),
    setTowerNotify: (towerId, notify) => apply((d) => editor.setTowerNotify(d, towerId, notify)),
    stackBlock: (towerId, input, today) => {
      const habitId = newId()
      return apply((d) => editor.stackBlock(d, towerId, input, today, Date.now(), habitId)) ? habitId : null
    },
    updateBlock: (habitId, patch) => apply((d) => editor.updateBlock(d, habitId, patch)),
    moveBlock: (habitId, dir) => apply((d) => editor.moveBlock(d, habitId, dir)),
    removeBlock: (habitId, today) => apply((d) => editor.removeBlock(d, habitId, today, Date.now())),
    discardBlock: (habitId, today) => apply((d) => editor.discardBlock(d, habitId, today)),
    restackBlock: (habitId, today) => apply((d) => editor.restackBlock(d, habitId, today, Date.now())),
  }
})
