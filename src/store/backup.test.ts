import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixtureWorld } from '@/test/fixtureWorld'
import { parseBackup } from '@/domain/validate'
import { saveBackup } from './backup'

describe('Backup-Export', () => {
  const state = createFixtureWorld('2026-11-15')
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exportiert ein wiederherstellbares Backup in die gewählte Datei', async () => {
    let contents = ''
    const close = vi.fn()
    vi.stubGlobal('window', {
      showSaveFilePicker: async () => ({
        createWritable: async () => ({
          write: async (file: File) => {
            contents = await file.text()
          },
          close,
          abort: vi.fn(),
        }),
      }),
    })
    expect(await saveBackup(state)).toBe('saved')
    expect(parseBackup(contents)).toEqual({ ok: true, state })
    expect(close).toHaveBeenCalledOnce()
  })

  it('teilt die JSON-Datei, wenn kein Dateidialog verfügbar ist', async () => {
    vi.stubGlobal('window', {})
    let shared: File | undefined
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: async (data: ShareData) => {
        shared = data.files?.[0]
      },
    })
    expect(await saveBackup(state)).toBe('shared')
    expect(shared?.name).toBe('habit-stacks-backup.json')
    expect(parseBackup(await shared!.text())).toEqual({ ok: true, state })
  })

  it.each(['picker', 'share'])('startet nach Abbruch von %s keinen Download', async (kind) => {
    const cancel = async () => {
      throw new DOMException('Cancelled', 'AbortError')
    }
    vi.stubGlobal('window', kind === 'picker' ? { showSaveFilePicker: cancel } : {})
    vi.stubGlobal('navigator', { canShare: () => true, share: cancel })
    const createElement = vi.fn()
    vi.stubGlobal('document', { createElement })
    expect(await saveBackup(state)).toBe('cancelled')
    expect(createElement).not.toHaveBeenCalled()
  })

  it('bricht bei einem Schreibfehler ab und meldet den Fehler', async () => {
    const abort = vi.fn(async () => {})
    const close = vi.fn()
    vi.stubGlobal('window', {
      showSaveFilePicker: async () => ({
        createWritable: async () => ({
          write: async () => {
            throw new Error('Disk full')
          },
          close,
          abort,
        }),
      }),
    })
    await expect(saveBackup(state)).rejects.toThrow('Disk full')
    expect(abort).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
  })

  it('lädt die JSON-Datei herunter, wenn das Gerät sie nicht teilen kann', async () => {
    vi.stubGlobal('window', { setTimeout: (callback: () => void) => callback() })
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: () => false, share })
    const a = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: () => a })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    expect(await saveBackup(state)).toBe('downloaded')
    expect(a.download).toBe('habit-stacks-backup.json')
    expect(a.click).toHaveBeenCalledOnce()
    expect(share).not.toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:backup')
  })

  it('meldet einen abgebrochenen Schreibvorgang als Fehler', async () => {
    const error = new DOMException('Write interrupted', 'AbortError')
    vi.stubGlobal('window', {
      showSaveFilePicker: async () => ({
        createWritable: async () => ({
          write: async () => {
            throw error
          },
          close: vi.fn(),
          abort: vi.fn(async () => {}),
        }),
      }),
    })
    await expect(saveBackup(state)).rejects.toBe(error)
  })
})
