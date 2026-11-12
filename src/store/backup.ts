import type { DomainState } from '@/domain/types'
import { createBackup, parseBackup, type ValidateResult } from '@/domain/validate'

/** Lädt den Zustand als JSON-Datei herunter (Web). In Capacitor später über Filesystem/Share. */
export function downloadBackup(state: DomainState, today: string) {
  const blob = new Blob([JSON.stringify(createBackup(state), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `habit-stacks-backup-${today}.json`
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readBackupFile(file: File): Promise<ValidateResult> {
  return parseBackup(await file.text())
}
