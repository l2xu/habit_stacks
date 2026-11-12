import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { pickDomain } from '@/domain/state'
import type { ID, TowerNotify } from '@/domain/types'
import { useToday } from '@/hooks/useToday'
import { useAppStore } from '@/store/useAppStore'
import { Section, SettingRow, TimeField, Toggle } from '@/ui/controls'
import { PixelButton } from '@/ui/PixelButton'
import { planPushes } from './plan'
import { pushStatusText, usePush } from './push'

const DEFAULT_NOTIFY: TowerNotify = { time: '08:00', remind: false, warn: false }
const TIME = new Intl.DateTimeFormat('de-DE', { hour: 'numeric', minute: '2-digit' })
const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'long' })

/** „heute um 8:00“, „morgen um 8:00“, „am Freitag um 8:00“ */
function whenLabel(at: number, nowMs: number): string {
  const day = (ms: number) => new Date(ms).setHours(0, 0, 0, 0)
  const n = Math.round((day(at) - day(nowMs)) / 86_400_000)
  const prefix = n === 0 ? 'heute' : n === 1 ? 'morgen' : `am ${WEEKDAY.format(at)}`
  return `${prefix} um ${TIME.format(at)}`
}

/** Push-Einstellungen eines Turms im Turm-Editor: Erinnerung, Warnung, eine Uhrzeit für beides. */
export function TowerNotifySection({ towerId }: { towerId: ID }) {
  const today = useToday()
  const domain = useAppStore(useShallow(pickDomain))
  const setTowerNotify = useAppStore((s) => s.setTowerNotify)
  const showToast = useAppStore((s) => s.showToast)
  const push = usePush()
  const notify = domain.towers[towerId]?.notify ?? DEFAULT_NOTIFY
  const on = notify.remind || notify.warn

  // Vorschau: die nächste geplante Nachricht dieses Turms – genau das, was der Server bekommt.
  const next = useMemo(() => {
    if (!on) return null
    const now = Date.now()
    const item = planPushes(domain, today, now).find((p) => p.towerId === towerId)
    return item ? { when: whenLabel(item.at, now), body: item.body } : null
  }, [on, domain, today, towerId])

  const enablePush = () =>
    push.enable().then((status) => {
      if (status === 'on') showToast('Push ist angemeldet.')
      else if (status === 'denied') showToast('Mitteilungen sind blockiert – erlaube sie in den Einstellungen des Geräts.')
    })

  const toggle = (key: 'remind' | 'warn') => (checked: boolean) => {
    setTowerNotify(towerId, { ...notify, [key]: checked })
    // Erst beim ersten Einschalten nach der Erlaubnis fragen – direkt im Tipp, sonst fragt iOS nicht.
    if (checked && push.status === 'off') void enablePush()
  }

  return (
    <Section title="Benachrichtigungen">
      {on && push.status !== 'on' && push.status !== null && (
        <div className="px-frame px-gold grid gap-2 p-3">
          <p className="text-[14px] leading-snug">{pushStatusText(push.status)}</p>
          {push.error && <p className="text-[13px] leading-snug font-semibold text-brick">Fehler: {push.error}</p>}
          {push.status === 'off' && (
            <PixelButton variant="go" disabled={push.busy} onClick={() => void enablePush()} className="h-10 text-[15px] font-semibold text-paper">
              Push anmelden
            </PixelButton>
          )}
        </div>
      )}
      <SettingRow label="Täglich erinnern" hint="Nur, wenn heute noch etwas offen ist.">
        <Toggle label="Täglich erinnern" checked={notify.remind} onChange={toggle('remind')} />
      </SettingRow>
      <SettingRow label="Bei Gefahr warnen" hint="Wenn ein Block bröckelt oder morgen abfällt, der Turm einzustürzen droht oder ein Geist wackelt.">
        <Toggle label="Bei Gefahr warnen" checked={notify.warn} onChange={toggle('warn')} />
      </SettingRow>
      {on && (
        <>
          <SettingRow label="Uhrzeit" hint="Für beides – höchstens eine Nachricht am Tag.">
            <TimeField label="Uhrzeit der Benachrichtigung" value={notify.time} onChange={(time) => setTowerNotify(towerId, { ...notify, time })} />
          </SettingRow>
          <p className="text-[13px] leading-snug text-ink-soft">
            {next ? (
              <>
                Nächste Nachricht {next.when}: <span className="text-ink">{next.body.replaceAll('\n', ' ')}</span>
              </>
            ) : (
              'Gerade ist nichts geplant – alles sicher.'
            )}
          </p>
        </>
      )}
    </Section>
  )
}
