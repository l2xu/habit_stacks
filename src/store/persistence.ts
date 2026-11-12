import { createStore, del, get, set } from 'idb-keyval'
import { currentDay } from '@/domain/dates'
import { DEFAULT_SETTINGS } from '@/domain/rules'
import { createEmptyState, domainChanged, pickDomain } from '@/domain/state'
import type { DomainState, StorageDriver } from '@/domain/types'
import { validateState } from '@/domain/validate'
import { useAppStore } from './useAppStore'

const KEY = 'state'
const SAVE_DELAY_MS = 250

// ───────────────────────────── Treiber ─────────────────────────────

/** IndexedDB speichert den Zustand als Objekt (structured clone) – kein JSON nötig. */
function indexedDbDriver(): StorageDriver {
  const store = createStore('habit-stacks', 'kv')
  return {
    name: 'IndexedDB',
    load: () => get(KEY, store),
    save: (state) => set(KEY, state, store),
    clear: () => del(KEY, store),
  }
}

function localStorageDriver(): StorageDriver {
  const key = 'habit-stacks/state'
  return {
    name: 'localStorage',
    load: async () => JSON.parse(localStorage.getItem(key) ?? 'null'),
    save: async (state) => localStorage.setItem(key, JSON.stringify(state)),
    clear: async () => localStorage.removeItem(key),
  }
}

/** Bevorzugt IndexedDB; fällt z. B. in alten privaten Fenstern auf localStorage zurück. */
async function pickDriver(): Promise<StorageDriver> {
  if ('indexedDB' in globalThis) {
    const idb = indexedDbDriver()
    try {
      await idb.load()
      return idb
    } catch {
      // IndexedDB blockiert → Fallback
    }
  }
  return localStorageDriver()
}

// ───────────────────────────── Start & Autosave ─────────────────────────────

/**
 * Lädt und prüft den gespeicherten Zustand, startet beim allerersten Start mit
 * einer leeren Insel, wertet bis gestern aus und speichert danach jede Änderung (entprellt).
 * Wird einmal vor dem ersten Render aufgerufen.
 */
export async function startPersistence(): Promise<void> {
  const store = useAppStore
  const driver = await pickDriver()
  store.getState().setStorageInfo({ driver: driver.name })
  void navigator.storage?.persist?.()

  let loaded: DomainState | null = null
  let writable = true
  try {
    const raw = await driver.load()
    if (raw != null) {
      const result = validateState(raw)
      if (result.ok) loaded = result.state
      else {
        // Unlesbare oder neuere Daten nie überschreiben – lieber nur im Speicher arbeiten.
        writable = false
        store.getState().setStorageInfo({
          error: result.reason === 'newer' ? 'Daten stammen aus einer neueren App-Version.' : 'Gespeicherte Daten sind beschädigt oder veraltet.',
        })
      }
    }
  } catch (err) {
    writable = false
    store.getState().setStorageInfo({ error: `Laden fehlgeschlagen: ${String(err)}` })
  }

  const settings = loaded?.settings ?? DEFAULT_SETTINGS
  const today = currentDay(settings.dayStartsAtHour, settings.devDayOffset)
  store.getState().replaceDomain(loaded ?? createEmptyState(settings), today)
  if (!writable) return

  let saved: DomainState | null = loaded
  let timer: number | undefined
  const flush = () => {
    window.clearTimeout(timer)
    timer = undefined
    const current = pickDomain(store.getState())
    if (saved && !domainChanged(saved, current)) return
    saved = current
    driver
      .save(current)
      .then(() => store.getState().setStorageInfo({ lastSavedAt: Date.now(), error: null }))
      .catch((err) => store.getState().setStorageInfo({ error: `Speichern fehlgeschlagen: ${String(err)}` }))
  }

  flush()
  store.subscribe((state) => {
    if (saved && !domainChanged(saved, state)) return
    window.clearTimeout(timer)
    timer = window.setTimeout(flush, SAVE_DELAY_MS)
  })
  // App geht in den Hintergrund (Mobile) → sofort sichern.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
  window.addEventListener('pagehide', flush)
}
