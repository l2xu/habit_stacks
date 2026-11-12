import { addDays } from '@/domain/dates'
import { evaluateAll } from '@/domain/engine'
import type { BlockVM, DomainState, ID, ISODate, TowerNotify, TowerVM } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import { buildTowerVM } from '@/store/selectors'

/** Eine geplante Push-Nachricht – so geht sie an den Server (`public/push/api.php`). */
export interface PlannedPush {
  /** Zeitpunkt in Millisekunden seit 1970 (UTC). */
  at: number
  towerId: ID
  title: string
  body: string
}

/** So viele Tage plant die App voraus. Wer so lange nicht hineinschaut, bekommt danach keine Nachrichten mehr. */
export const PLAN_DAYS = 14

export const isNotifyOn = (n: TowerNotify | undefined): n is TowerNotify => !!n && (n.remind || n.warn)

/**
 * Zeitpunkt der Nachricht für den Kalendertag `day` (Ortszeit des Geräts, Sommerzeit inklusive).
 * Uhrzeiten vor der Tagesgrenze gehören noch zum Vortag: 02:00 bei Grenze 4 Uhr = die Nacht nach `day`.
 * `offsetDays`: Dev-Zeitreise – „heute“ der App liegt so viele Tage nach dem echten Heute.
 */
export function pushTime(day: ISODate, time: string, dayStartsAtHour: number, offsetDays = 0): number {
  const [h, m] = time.split(':').map(Number) as [number, number]
  const date = addDays(day, (h < dayStartsAtHour ? 1 : 0) - offsetDays)
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, mo - 1, d, h, m).getTime()
}

/**
 * Plant die Nachrichten der nächsten `days` Tage unter der Annahme, dass ab jetzt nichts mehr abgehakt wird.
 * Dafür läuft die Engine Tag für Tag weiter: So steht schon heute fest, wann ein Block ohne Häkchen bröckelt,
 * abfällt oder ein Geist wackelt. Jedes Häkchen ändert den Plan – die App schickt ihn dann neu an den Server.
 */
export function planPushes(state: DomainState, today: ISODate, nowMs: number, days = PLAN_DAYS): PlannedPush[] {
  if (!state.towerOrder.some((id) => isNotifyOn(state.towers[id]?.notify))) return []
  const { dayStartsAtHour, devDayOffset } = state.settings
  const out: PlannedPush[] = []
  let s = evaluateAll(state, today, nowMs)
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i)
    if (i > 0) s = evaluateAll(s, day, nowMs)
    for (const id of s.towerOrder) {
      const tower = s.towers[id]
      const notify = tower?.notify
      // Pausiert: keine Nachrichten, bis der Turm fortgesetzt wird (das geht nur in der App – dann wird neu geplant).
      if (!tower || tower.pausedSince || !isNotifyOn(notify)) continue
      const at = pushTime(day, notify.time, dayStartsAtHour, devDayOffset)
      if (at <= nowMs) continue
      const message = towerMessage(buildTowerVM(s, tower, day), notify)
      if (message) out.push({ at, towerId: id, ...message })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * Nachricht eines Turms für einen Tag. Warnungen gehen vor (höchstens zwei Zeilen, die dringendste zuerst),
 * sonst die Erinnerung. null: heute ist alles erledigt oder es gibt nichts zu sagen.
 */
export function towerMessage(vm: TowerVM, notify: TowerNotify): { title: string; body: string } | null {
  const due = vm.blocks.filter((b) => !b.upcoming)
  const open = due.filter((b) => !b.doneToday).length
  if (open === 0) return null
  const title = plainTitle(vm.name)
  const warnings = notify.warn ? warningLines(vm) : []
  if (warnings.length > 0) return { title, body: warnings.slice(0, 2).join('\n') }
  return notify.remind ? { title, body: reminderLine(vm, open, due.length) } : null
}

const quoted = (b: BlockVM) => `„${plainTitle(b.title)}“`

/** „A“, „B“ und „C“ */
function names(blocks: BlockVM[]): string {
  const q = blocks.map(quoted)
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} und ${q.at(-1)}` : (q[0] ?? '')
}

/** Was heute verloren gehen kann – Einsturz und Abfallen zuerst, dann der wackelnde Geist, dann Bröckeln. */
function warningLines(vm: TowerVM): string[] {
  const lines: string[] = []
  const crumbling = vm.blocks.filter((b) => b.visual === 'crumbling' && !b.doneToday)
  const falling = crumbling.filter((b) => b.fallIn === 1)
  const starting = crumbling.filter((b) => b.fallIn !== 1)
  const wobbling = vm.blocks.filter((b) => b.wobbling)

  if (vm.collapsing) {
    const n = Math.max(...crumbling.map((b) => b.fallIn ?? 1))
    lines.push(
      n <= 1
        ? 'Einsturz droht! Erledige heute alles, sonst stürzt der Turm morgen früh ein.'
        : `Der Turm bröckelt! Erledige heute alles, sonst stürzt er in ${n} Tagen ein.`,
    )
  } else if (falling.length > 0) {
    lines.push(`${names(falling)} ${falling.length === 1 ? 'fällt' : 'fallen'} morgen früh ab – heute erledigen!`)
  }
  if (wobbling.length > 0) {
    lines.push(`${names(wobbling)} wackelt – gestern verpasst. Heute erledigen, sonst bricht der Geist weg.`)
  }
  if (!vm.collapsing && starting.length > 0) {
    const n = Math.min(...starting.map((b) => b.fallIn ?? 2))
    lines.push(
      starting.length === 1
        ? `${names(starting)} bröckelt – heute erledigen, sonst fällt der Block in ${n} Tagen ab.`
        : `${names(starting)} bröckeln – heute erledigen, sonst fallen sie in ${n} Tagen ab.`,
    )
  }
  return lines
}

function reminderLine(vm: TowerVM, open: number, total: number): string {
  const next = vm.nextBlock ? quoted(vm.nextBlock) : null
  if (open === total) return next ? `Zeit zum Stapeln! Los geht's mit ${next}.` : 'Zeit zum Stapeln!'
  return `Noch ${open} von ${total} Blöcken offen${next ? ` – weiter mit ${next}` : ''}.`
}
