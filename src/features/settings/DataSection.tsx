import { useRef, useState } from 'react'
import { currentDay } from '@/domain/dates'
import { createEmptyState, pickDomain } from '@/domain/state'
import type { DomainState } from '@/domain/types'
import { saveBackup, readBackupFile } from '@/store/backup'
import { useAppStore } from '@/store/useAppStore'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { Section, SettingRow } from '@/ui/controls'
import { PixelButton } from '@/ui/PixelButton'

const TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

/** "Daten & Backup": Export, Import, Löschen. Die Zeitreise steckt in den DevTools (features/dev). */
export function DataSection({ onClose }: { onClose: () => void }) {
  const storage = useAppStore((s) => s.ui.storage)
  const replaceDomain = useAppStore((s) => s.replaceDomain)
  const showToast = useAppStore((s) => s.showToast)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<DomainState | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const result = await saveBackup(pickDomain(useAppStore.getState()))
      if (result === 'saved') showToast('Backup gespeichert.')
      if (result === 'shared') showToast('Backup an die gewählte App übergeben.')
      if (result === 'downloaded') showToast('Backup-Download gestartet.')
    } catch {
      showToast('Backup konnte nicht exportiert werden. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  const replace = (domain: DomainState, message: string) => {
    replaceDomain(domain, currentDay(domain.settings.dayStartsAtHour, domain.settings.devDayOffset))
    showToast(message)
    onClose()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const result = await readBackupFile(file)
    if (result.ok) setPendingImport(result.state)
    else showToast(result.reason === 'newer' ? 'Backup stammt aus einer neueren App-Version.' : 'Datei ist kein gültiges Backup.')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Section title="Daten & Backup">
      <div>
        <p className="text-[14px] leading-snug text-ink-soft">
          Alles bleibt auf diesem Gerät ({storage.driver}).
          {storage.lastSavedAt && ` Zuletzt gespeichert um ${TIME.format(storage.lastSavedAt)}.`}
        </p>
        {storage.error && <p className="mt-1 text-[14px] font-semibold text-brick">{storage.error}</p>}
      </div>
      <SettingRow label="Backup exportieren" hint="Wähle im Speichern- oder Teilen-Dialog einen Ort für deine JSON-Datei. Falls nicht unterstützt, startet ein Download.">
        <PixelButton disabled={saving} onClick={() => void save()} className="h-10 w-28 shrink-0 text-[15px] font-semibold">
          {saving ? 'Bitte warten' : 'Export'}
        </PixelButton>
      </SettingRow>
      <SettingRow label="Backup importieren" hint={pendingImport ? 'Ersetzt alle aktuellen Daten.' : 'Lädt eine zuvor exportierte Datei.'}>
        {pendingImport ? (
          <PixelButton variant="go" onClick={() => replace(pendingImport, 'Backup importiert.')} className="h-10 w-28 shrink-0 text-[15px] font-semibold text-paper">
            Ersetzen
          </PixelButton>
        ) : (
          <PixelButton onClick={() => fileRef.current?.click()} className="h-10 w-28 shrink-0 text-[15px] font-semibold">
            Datei …
          </PixelButton>
        )}
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </SettingRow>
      <SettingRow label="Alles löschen" hint="Entfernt alle Türme, Logs und Einstellungen.">
        <ConfirmButton danger onConfirm={() => replace(createEmptyState(), 'Alle Daten gelöscht.')}>
          Löschen
        </ConfirmButton>
      </SettingRow>
    </Section>
  )
}
