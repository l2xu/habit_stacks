import { useRef, useState } from 'react'
import { currentDay } from '@/domain/dates'
import { useToday } from '@/hooks/useToday'
import { PushSection } from '@/features/notify/PushSection'
import { playFeedback, playSfx } from '@/lib/feedback'
import { useAppStore } from '@/store/useAppStore'
import { Section, SettingRow, Stepper, Toggle } from '@/ui/controls'
import { PanelHeader } from '@/ui/PanelHeader'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { COFFEE, GAMEPAD, GLOBE, OCTOCAT, type PixelSprite } from '@/ui/sprites'
import { DataSection } from './DataSection'

/** Spielraum für die Tagesgrenze: Mitternacht bis 6 Uhr morgens. */
const HOUR_MAX = 6
const DAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })
const dayLabel = (d: string) => DAY.format(new Date(`${d}T12:00`))

/** Versteckter Zugang zu den DevTools: so oft schnell hintereinander auf die Versionszeile tippen. */
const DEV_TAPS = 5
const DEV_TAP_WINDOW_MS = 2000

/** Zahnrad: Einstellungen, Daten & Backup. */
export function SettingsPanel({ onClose, onDev }: { onClose: () => void; onDev?: () => void }) {
  const taps = useRef<number[]>([])
  const tapVersion = () => {
    if (!onDev) return
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < DEV_TAP_WINDOW_MS), now]
    if (taps.current.length >= DEV_TAPS) {
      taps.current = []
      onDev()
    }
  }

  return (
    <>
      <PanelHeader title="Einstellungen" onClose={onClose} />
      <GeneralSection />
      <PushSection />
      <DataSection onClose={onClose} />
      <LinksSection />
      <p onClick={tapVersion} className="mt-6 mb-1 text-center font-micro text-[10px] leading-relaxed text-ink-soft select-none">
        Version {__APP_VERSION__}
        <br />
        {import.meta.env.DEV ? 'Entwicklung' : `Build ${__BUILD_TIME__}`}
      </p>
    </>
  )
}

const LINKS: { label: string; href: string; icon: PixelSprite }[] = [
  { label: 'Website', href: 'https://lukasweihrauch.de/', icon: GLOBE },
  { label: 'GitHub', href: 'https://github.com/l2xu', icon: OCTOCAT },
  { label: 'Feedback auf Discord', href: 'https://discord.com/invite/9pFXzs6XRK', icon: GAMEPAD },
  { label: 'Unterstützen auf Ko-fi', href: 'https://ko-fi.com/lukasweihrauch', icon: COFFEE },
]

/** "Meine Links": Website, GitHub, Discord und Ko-fi. Öffnen im Browser, nicht in der App. */
function LinksSection() {
  return (
    <Section title="Meine Links">
      <ul className="grid gap-2.5 text-[16px] leading-snug">
        {LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
              <span className="flex w-[22px] shrink-0 justify-center">
                <PixelIcon sprite={l.icon} px={2} />
              </span>
              <span className="grid">
                <span className="font-semibold">{l.label}</span>
                <span className="text-[14px] text-ink-soft underline decoration-2 underline-offset-2">
                  {l.href.replace(/^https:\/\//, '').replace(/\/$/, '')}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function GeneralSection() {
  const today = useToday()
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  // Würde "heute" durch die neue Grenze sofort springen, erst nachfragen.
  const [pendingHour, setPendingHour] = useState<number | null>(null)
  const hour = pendingHour ?? settings.dayStartsAtHour
  const offset = settings.devDayOffset ?? 0
  const pendingDay = pendingHour === null ? null : currentDay(pendingHour, offset)

  const changeHour = (h: number) => {
    if (h === settings.dayStartsAtHour || currentDay(h, offset) === today) {
      setPendingHour(null)
      updateSettings({ dayStartsAtHour: h })
    } else setPendingHour(h)
  }

  return (
    <Section title="Allgemein">
      <SettingRow label="Neuer Tag ab" hint={hour === 0 ? 'Der Tag wechselt um Mitternacht.' : `Bis ${hour - 1}:59 Uhr zählt alles zum Vortag.`}>
        <Stepper
          label="Tagesgrenze"
          value={`${hour}:00`}
          canDec={hour > 0}
          canInc={hour < HOUR_MAX}
          onDec={() => changeHour(hour - 1)}
          onInc={() => changeHour(hour + 1)}
        />
      </SettingRow>
      {pendingDay && (
        <div className="px-frame px-gold grid gap-2 p-3">
          <p className="text-[14px] leading-snug">
            Damit springt „heute“ sofort von {dayLabel(today)} auf {dayLabel(pendingDay)}.
            {pendingDay > today && ` Der ${dayLabel(today)} gilt dann als abgeschlossen und wird ausgewertet.`}
          </p>
          <div className="flex gap-2">
            <PixelButton
              onClick={() => {
                updateSettings({ dayStartsAtHour: hour })
                setPendingHour(null)
              }}
              className="h-10 flex-1 text-[15px] font-semibold"
            >
              Trotzdem ändern
            </PixelButton>
            <PixelButton onClick={() => setPendingHour(null)} className="h-10 flex-1 text-[15px] font-semibold">
              Abbrechen
            </PixelButton>
          </div>
        </div>
      )}
      <SettingRow label="Töne" hint="8-Bit-Sounds im Fokus-Modus und kleine Effekte auf der Insel.">
        <Toggle
          label="Töne"
          checked={settings.sound}
          onChange={(sound) => {
            updateSettings({ sound })
            if (sound) playFeedback('step', { sound })
          }}
        />
      </SettingRow>
      <SettingRow label="Naturgeräusche" hint="Wind und Wellen, tagsüber Vögel, abends Grillen.">
        <Toggle
          label="Naturgeräusche"
          checked={settings.ambience}
          onChange={(ambience) => {
            updateSettings({ ambience })
            playSfx('toggle', settings.sound)
          }}
        />
      </SettingRow>
    </Section>
  )
}
