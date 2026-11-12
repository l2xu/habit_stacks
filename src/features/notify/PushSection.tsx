import { useNow } from '@/hooks/useNow'
import { useAppStore } from '@/store/useAppStore'
import { Section, SettingRow } from '@/ui/controls'
import { PixelButton } from '@/ui/PixelButton'
import { isNotifyOn } from './plan'
import { pushStatusText, usePush } from './push'

const TIME = new Intl.DateTimeFormat('de-DE', { hour: 'numeric', minute: '2-digit' })
/** Läuft der Cronjob jede Minute, ist der letzte Lauf nie älter als das. */
const CRON_STALE_MS = 3 * 60_000

/** Einstellungen → Benachrichtigungen: anmelden, testen, abschalten – plus Diagnose (Server, Cronjob, Plan, Fehler). */
export function PushSection() {
  const push = usePush()
  const showToast = useAppStore((s) => s.showToast)
  const towers = useAppStore((s) => s.towerOrder.filter((id) => isNotifyOn(s.towers[id]?.notify)).length)
  const now = useNow(30_000)

  const server = push.server
  const serverLine = !server
    ? null
    : !server.ok
      ? `Push-Server nicht erreichbar: ${server.error}`
      : server.cronAt === null
        ? 'Push-Server erreichbar, aber der Cronjob lief noch nie – geplante Aufgabe prüfen.'
        : now - server.cronAt > CRON_STALE_MS
          ? `Push-Server erreichbar, aber der Cronjob lief zuletzt um ${TIME.format(server.cronAt)} – er sollte jede Minute laufen.`
          : `Push-Server erreichbar, Cronjob läuft (zuletzt ${TIME.format(server.cronAt)}).`

  return (
    <Section title="Benachrichtigungen">
      <div className="grid gap-1 text-[14px] leading-snug text-ink-soft">
        <p>{pushStatusText(push.status)}</p>
        <p>
          {towers === 0
            ? 'Erinnerung und Warnung stellst du pro Turm ein: Turm gedrückt halten → Benachrichtigungen.'
            : `${towers} ${towers === 1 ? 'Turm meldet' : 'Türme melden'} sich. Ändern: Turm gedrückt halten → Benachrichtigungen.`}
        </p>
        {serverLine && <p className={server?.ok && server.cronAt !== null && now - server.cronAt <= CRON_STALE_MS ? '' : 'font-semibold text-brick'}>{serverLine}</p>}
        {push.status === 'on' && push.synced && (
          <p>
            Plan gesendet um {TIME.format(push.synced.at)} · {push.synced.items} {push.synced.items === 1 ? 'Nachricht' : 'Nachrichten'} geplant.
          </p>
        )}
        {push.error && <p className="font-semibold text-brick">Fehler: {push.error}</p>}
      </div>
      {push.status === 'off' && (
        <SettingRow label="Push anmelden" hint="Einmal pro Gerät. Beim ersten Mal fragt das Gerät nach der Erlaubnis.">
          <PixelButton
            variant="go"
            disabled={push.busy}
            onClick={() =>
              void push.enable().then((status) => {
                if (status === 'on') showToast('Push ist angemeldet.')
                else if (status === 'denied') showToast('Mitteilungen sind blockiert – erlaube sie in den Einstellungen des Geräts.')
              })
            }
            className="h-10 w-28 shrink-0 text-[15px] font-semibold text-paper"
          >
            Anmelden
          </PixelButton>
        </SettingRow>
      )}
      {push.status === 'on' && (
        <>
          <SettingRow label="Test-Nachricht" hint="Kommt in ein paar Sekunden.">
            <PixelButton
              disabled={push.busy}
              onClick={() =>
                void push.test().then(
                  () => showToast('Test-Nachricht ist unterwegs.'),
                  () => showToast('Senden fehlgeschlagen – läuft der Push-Server?'),
                )
              }
              className="h-10 w-28 shrink-0 text-[15px] font-semibold"
            >
              Senden
            </PixelButton>
          </SettingRow>
          <SettingRow label="Auf diesem Gerät aus" hint="Die Einstellungen der Türme bleiben erhalten.">
            <PixelButton disabled={push.busy} onClick={() => void push.disable()} className="h-10 w-28 shrink-0 text-[15px] font-semibold">
              Abschalten
            </PixelButton>
          </SettingRow>
        </>
      )}
    </Section>
  )
}
