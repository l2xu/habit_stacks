import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { formingBlocks } from '@/domain/editor'
import { solidifyOnCompletion } from '@/domain/engine'
import { pickDomain } from '@/domain/state'
import type { DomainState, Habit, ID, ISODate, Tower } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import type { NewsTone } from '@/features/news/news'
import { BlockThumb } from '@/features/world/BlockThumb'
import { useGroundImage } from '@/features/world/StaticGround'
import { useCameraTransform } from '@/features/world/useCameraView'
import { useWorldCanvas } from '@/features/world/canvas/WorldCanvas'
import { useToday } from '@/hooks/useToday'
import { useAppStore } from '@/store/useAppStore'
import { Section, Segmented, SettingRow, Stepper, Toggle } from '@/ui/controls'
import { PanelHeader } from '@/ui/PanelHeader'
import { PixelButton } from '@/ui/PixelButton'
import {
  advance,
  devEdit,
  previewNextDay,
  replayNews,
  rewind,
  setDone,
  setLifecycle,
  setSkips,
  setStones,
  setTowerDone,
  setWobbling,
  towerDebug,
  useDevStore,
  type DayPlan,
} from './devTools'

/** Schritte für „so viele Tage auf einmal“ – bis 56. */
const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 21, 28, 56] as const
const DAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })
const dayLabel = (d: ISODate) => DAY.format(new Date(`${d}T12:00`))
const daysLabel = (n: number) => (n === 1 ? '1 Tag' : `${n} Tage`)
const TONE: Record<NewsTone, string> = { good: 'text-ink', warn: 'text-ink', bad: 'font-semibold text-brick' }

const LIFECYCLE = [
  { value: 'forming', label: 'Geist' },
  { value: 'solid', label: 'Fest' },
] as const

/**
 * DevTools (vorübergehend): Zeit vorspulen, Häkchen setzen, Blöcke in Zustände versetzen.
 * Aus der Detailansicht nur für den offenen Turm, aus der Übersicht für alle.
 */
export function DevPanel({ towerId, onClose }: { towerId: ID | null; onClose: () => void }) {
  const today = useToday()
  const domain = useAppStore(useShallow(pickDomain))
  const showToast = useAppStore((s) => s.showToast)
  const history = useDevStore((s) => s.history)
  const canReplay = useDevStore((s) => s.lastJumpEventIds.length > 0)
  const groundImage = useGroundImage((s) => s.on)
  const cameraTransform = useCameraTransform((s) => s.on)
  const worldCanvas = useWorldCanvas((s) => s.on)
  const [step, setStep] = useState(0)
  const days = STEPS[step]!
  const offset = domain.settings.devDayOffset ?? 0

  const preview = useMemo(() => previewNextDay(domain, today), [domain, today])
  const shown = towerId ? preview.filter((n) => n.event.towerId === towerId) : preview
  const towers = (towerId ? [towerId] : domain.towerOrder).flatMap((id) => {
    const t = domain.towers[id]
    return t ? [t] : []
  })

  const jump = (plan: DayPlan) => {
    const result = advance(days, plan)
    if (result.news === 0) showToast(`Jetzt ${dayLabel(result.today)} – keine Neuigkeiten.`)
    onClose()
  }

  return (
    <>
      <PanelHeader
        title="DevTools"
        subtitle={`Heute: ${dayLabel(today)}${offset > 0 ? ` · ${daysLabel(offset)} vorgespult` : ''}`}
        onClose={onClose}
      />
      <p className="mt-2 text-[13px] leading-snug text-ink-soft">Ändert die echten Daten. Vorher ggf. ein Backup exportieren (Zahnrad).</p>

      <Section title="Zeit">
        <div className="px-frame px-white grid gap-1 px-3 py-2">
          <p className="text-[12px] leading-none font-bold tracking-wide text-ink-soft uppercase">Morgen früh · +1 Tag wie heute</p>
          {shown.length === 0 ? (
            <p className="text-[14px] leading-snug">Nichts – alles sicher.</p>
          ) : (
            <ul className="grid gap-0.5">
              {shown.map((n) => (
                <li key={n.event.id} className={`text-[14px] leading-snug ${TONE[n.tone]}`}>
                  • {n.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        <SettingRow label="Vorspulen um">
          <Stepper
            label="Tage"
            value={daysLabel(days)}
            canDec={step > 0}
            canInc={step < STEPS.length - 1}
            onDec={() => setStep(step - 1)}
            onInc={() => setStep(step + 1)}
          />
        </SettingRow>
        <div className="grid grid-cols-3 gap-1.5">
          <PixelButton variant="go" onClick={() => jump('today')} className="h-12 text-[15px] font-semibold text-paper">
            Wie heute
          </PixelButton>
          <PixelButton onClick={() => jump('all')} className="h-12 text-[15px] font-semibold">
            Alles
          </PixelButton>
          <PixelButton onClick={() => jump('none')} className="h-12 text-[15px] font-semibold">
            Nichts
          </PixelButton>
        </div>
        <p className="text-[13px] leading-snug text-ink-soft">
          <b>Wie heute:</b> die heutigen Häkchen gelten für jeden Tag. <b>Alles:</b> jeder Block jeden Tag erledigt. <b>Nichts:</b> kein Häkchen – auch
          die heutigen fallen weg.
        </p>
        {history.length > 0 ? (
          <div className="grid gap-1">
            <div className="flex gap-1.5">
              <PixelButton onClick={() => rewind()} className="h-10 flex-1 text-[15px] font-semibold">
                Zurückdrehen
              </PixelButton>
              {history.length > 1 && (
                <PixelButton onClick={() => rewind(true)} className="h-10 flex-1 text-[15px] font-semibold">
                  Zum Anfang ({history.length})
                </PixelButton>
              )}
            </div>
            <p className="text-[13px] leading-snug text-ink-soft">Zuletzt: {history.at(-1)!.label}. Der Verlauf geht beim Neuladen verloren.</p>
          </div>
        ) : (
          offset > 0 && (
            <p className="text-[13px] leading-snug text-ink-soft">Kein Verlauf (neu geladen). Zurück in die Gegenwart: Zahnrad → „Alles löschen“ oder ein Backup importieren.</p>
          )
        )}
        {canReplay && (
          <PixelButton
            onClick={() => {
              replayNews()
              onClose()
            }}
            className="h-10 text-[15px] font-semibold"
          >
            Neuigkeiten nochmal abspielen
          </PixelButton>
        )}
      </Section>

      <Section title="Darstellung">
        <SettingRow label="Welt als Canvas" hint="Aus: Die Welt ist wieder SVG wie bisher – zum Vergleichen von Leistung und Aussehen. Gilt bis zum Neuladen.">
          <Toggle label="Welt als Canvas" checked={worldCanvas} onChange={(on) => useWorldCanvas.setState({ on })} />
        </SettingRow>
        {!worldCanvas && (
          <>
            <SettingRow label="Insel als Bild" hint="Nur SVG. Aus: Insel und Deko bleiben SVG – zum Vergleichen der Leistung. Gilt bis zum Neuladen.">
              <Toggle label="Insel als Bild" checked={groundImage} onChange={(on) => useGroundImage.setState({ on })} />
            </SettingRow>
            <SettingRow label="Kamera als Transform" hint="Nur SVG. Aus: Jede Kamerafahrt rechnet die Welt pro Frame neu (viewBox). Gilt bis zum Neuladen.">
              <Toggle label="Kamera als Transform" checked={cameraTransform} onChange={(on) => useCameraTransform.setState({ on })} />
            </SettingRow>
          </>
        )}
      </Section>

      {towers.map((t) => (
        <TowerDev key={t.id} s={domain} tower={t} today={today} />
      ))}
    </>
  )
}

function TowerDev({ s, tower, today }: { s: DomainState; tower: Tower; today: ISODate }) {
  const [expanded, setExpanded] = useState<ID | null>(null)
  const dbg = towerDebug(s, tower, today)
  const doneCount = tower.blockIds.filter((id) => `${id}|${today}` in s.logs).length
  const ghostFree = formingBlocks(s, tower.id).length < s.rules.maxFormingPerTower

  return (
    <Section title={tower.name}>
      <div className="text-[13px] leading-snug">
        <p className="font-semibold">
          Streak {dbg.streak} · Fehltage {dbg.missed}
        </p>
        <p className="text-ink-soft">{dbg.status}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 flex-1 text-[15px] leading-tight font-semibold">
          Heute erledigt <span className="font-normal text-ink-soft">{`${doneCount}/${tower.blockIds.length}`}</span>
        </p>
        <PixelButton
          disabled={doneCount === tower.blockIds.length}
          onClick={() => devEdit((d, t) => setTowerDone(d, tower.id, t, true))}
          className="h-10 px-3 text-[14px] font-semibold"
        >
          Alle
        </PixelButton>
        <PixelButton disabled={doneCount === 0} onClick={() => devEdit((d, t) => setTowerDone(d, tower.id, t, false))} className="h-10 px-3 text-[14px] font-semibold">
          Keine
        </PixelButton>
      </div>
      <ol className="grid gap-1.5">
        {tower.blockIds.toReversed().map((id) => {
          const habit = s.habits[id]
          return (
            habit && (
              <BlockDev
                key={id}
                s={s}
                habit={habit}
                today={today}
                ghostFree={ghostFree}
                expanded={expanded === id}
                onExpand={() => setExpanded(expanded === id ? null : id)}
              />
            )
          )
        })}
      </ol>
    </Section>
  )
}

interface BlockDevProps {
  s: DomainState
  habit: Habit
  today: ISODate
  ghostFree: boolean
  expanded: boolean
  onExpand: () => void
}

/** Ein Block: Häkchen für heute; aufgeklappt Status, Würfel, Wackeln bzw. Überspringen. */
function BlockDev({ s, habit, today, ghostFree, expanded, onExpand }: BlockDevProps) {
  const title = plainTitle(habit.title)
  const done = `${habit.id}|${today}` in s.logs
  const { formationDays, skip } = s.rules
  const stacked = habit.role === 'stacked'
  const f = habit.lifecycle === 'forming' ? habit.formation : null
  const skips = habit.skippedInRow ?? 0
  const risk = f ? f.missedInRow > 0 : skips >= skip.crumbleAfter
  const status = !stacked
    ? 'Anker'
    : f
      ? `Geist · ${f.doneDays}/${formationDays} Tage bis gestern${f.missedInRow > 0 ? ' · wackelt' : ''}`
      : `Fest · ${skips}× übersprungen${skips >= skip.crumbleAfter ? ' · bröckelt' : ''}`
  const skipOptions = Array.from({ length: skip.fallAfter }, (_, i) => ({ value: String(i), label: String(i) }))

  return (
    <li className="px-frame grid py-1 pr-1.5 pl-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!stacked}
          onClick={onExpand}
          aria-expanded={stacked ? expanded : undefined}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <BlockThumb color={habit.color} size={32} className={f ? 'opacity-55' : ''} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] leading-tight font-semibold">{title}</span>
            <span className={`block truncate text-[12px] leading-tight ${risk ? 'font-semibold text-brick' : 'text-ink-soft'}`}>{status}</span>
          </span>
          {stacked && (
            <span aria-hidden className="text-[13px] text-ink-soft">
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </button>
        <Toggle label={`${title} heute erledigt`} checked={done} onChange={(v) => devEdit((d, t) => solidifyOnCompletion(setDone(d, habit.id, t, v), habit.id, t))} />
      </div>

      {expanded && stacked && (
        <div className="mt-1 mb-1.5 grid gap-3 border-t-2 border-dashed border-ink/15 pt-2.5">
          <div className="grid gap-1">
            <Segmented
              label={`Status von ${title}`}
              value={f ? 'forming' : 'solid'}
              options={LIFECYCLE}
              onChange={(to) => devEdit((d, t) => setLifecycle(d, habit.id, to, t))}
            />
            {!f && !ghostFree && <p className="text-[12px] leading-snug text-ink-soft">Pro Turm nur ein Geist – erst den anderen verfestigen.</p>}
          </div>
          {f ? (
            <>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[15px] leading-tight font-semibold">Erledigte Tage bis gestern</p>
                  <p className="text-[15px] font-semibold tabular-nums">
                    {f.doneDays}/{formationDays}
                  </p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={formationDays}
                  value={f.doneDays}
                  aria-label={`Erledigte Tage von ${title}`}
                  onChange={(e) => devEdit((d) => setStones(d, habit.id, Number(e.target.value)))}
                  className="mt-1 h-8 w-full accent-ink"
                />
                <p className="text-[12px] leading-snug text-ink-soft">
                  {formationDays - 1} und heute erledigt → verfestigt sich beim nächsten Tag.
                </p>
              </div>
              <SettingRow label="Wackelt" hint="Gestern verpasst – noch ein Fehltag, dann bricht er.">
                <Toggle label={`${title} wackelt`} checked={f.missedInRow > 0} onChange={(v) => devEdit((d) => setWobbling(d, habit.id, v))} />
              </SettingRow>
            </>
          ) : (
            <div>
              <p className="text-[15px] leading-tight font-semibold">Übersprungen in Folge</p>
              <p className="text-[12px] leading-snug text-ink-soft">
                Ab {skip.crumbleAfter} bröckelt er, beim {skip.fallAfter}. Mal fällt er ab. Zählt jeden Tag ohne Häkchen.
              </p>
              <Segmented
                label={`${title} übersprungen`}
                value={String(Math.min(skips, skip.fallAfter - 1))}
                options={skipOptions}
                onChange={(v) => devEdit((d) => setSkips(d, habit.id, Number(v)))}
                className="mt-1.5"
              />
            </div>
          )}
        </div>
      )}
    </li>
  )
}
