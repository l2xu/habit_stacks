import type { DomainState } from '@/domain/types'
import { createBackup, parseBackup, type ValidateResult } from '@/domain/validate'

interface SaveFileWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{ createWritable(): Promise<{
    write(data: Blob): Promise<void>
    close(): Promise<void>
    abort(): Promise<void>
  }> }>
}

export type BackupSaveResult = 'saved' | 'shared' | 'downloaded' | 'cancelled'

export async function saveBackup(state: DomainState): Promise<BackupSaveResult> {
  const file = new File([JSON.stringify(createBackup(state), null, 2)], 'habit-stacks-backup.json', { type: 'application/json' })
  const picker = (window as SaveFileWindow).showSaveFilePicker
  if (picker) {
    const handle = await picker.call(window, {
      suggestedName: file.name,
      types: [{ description: 'Habit Stacks Backup', accept: { 'application/json': ['.json'] } }],
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      throw error
    })
    if (!handle) return 'cancelled'
    const writable = await handle.createWritable()
    try {
      await writable.write(file)
      await writable.close()
    } catch (error) {
      await writable.abort().catch(() => {})
      throw error
    }
    return 'saved'
  }
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Habit Stacks Backup' })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      throw error
    }
  }

  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

export async function readBackupFile(file: File): Promise<ValidateResult> {
  return parseBackup(await file.text())
}
