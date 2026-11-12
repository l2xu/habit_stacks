import { useId, type ReactNode } from 'react'
import { PixelButton } from './PixelButton'

/** Kleine Überschrift über einem Feld oder Abschnitt. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-[12px] leading-none font-bold tracking-wide text-ink-soft uppercase">
      {children}
    </label>
  )
}

interface TextFieldProps {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  hint?: ReactNode
  onEnter?: () => void
  onBlur?: () => void
}

/** Textfeld im Pixel-Rahmen. Schrift ≥ 16 px, sonst zoomt iOS beim Antippen hinein. */
export function TextField({ label, value, onChange, placeholder, maxLength = 40, hint, onEnter, onBlur }: TextFieldProps) {
  const id = useId()
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="px-frame px-white px-field mt-1.5">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            onEnter?.()
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          enterKeyHint="done"
          className="block h-11 w-full bg-transparent px-3 text-[17px] font-medium outline-none placeholder:text-ink-soft/55"
        />
      </div>
      {hint && <p className="mt-1 text-[13px] leading-snug text-ink-soft">{hint}</p>}
    </div>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  className?: string
}

/** Auswahl aus wenigen Optionen; die gewählte Taste ist dunkel wie der Fokus-Reiter. */
export function Segmented<T extends string>({ label, value, options, onChange, className = '' }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex gap-1.5 ${className}`}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`px-frame px-button h-11 min-w-0 flex-1 px-2 text-[15px] font-semibold ${active ? 'px-tab text-paper' : ''}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Pixel-Schalter (role="switch"): grün = an. */
export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`px-frame px-button relative h-11 w-[72px] shrink-0 ${checked ? 'px-go' : 'px-stone'}`}
    >
      <span className={`px-frame px-white absolute top-1.5 size-8 transition-[left] duration-100 ${checked ? 'left-[34px]' : 'left-1.5'}`} />
    </button>
  )
}

interface StepperProps {
  label: string
  value: ReactNode
  onDec: () => void
  onInc: () => void
  canDec: boolean
  canInc: boolean
}

/** − Wert + */
export function Stepper({ label, value, onDec, onInc, canDec, canInc }: StepperProps) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-1.5">
      <PixelButton aria-label={`${label} verringern`} disabled={!canDec} onClick={onDec} className="size-11 text-[22px] font-bold">
        −
      </PixelButton>
      <span className="min-w-[4.5em] text-center text-[17px] leading-none font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <PixelButton aria-label={`${label} erhöhen`} disabled={!canInc} onClick={onInc} className="size-11 text-[22px] font-bold">
        +
      </PixelButton>
    </div>
  )
}

/** Uhrzeit 'HH:MM' mit dem Zeitwähler des Geräts (iOS: Walze). Leere Eingaben (Löschen) werden ignoriert. */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="px-frame px-white px-field shrink-0">
      <input
        type="time"
        aria-label={label}
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value.slice(0, 5))}
        className="block h-11 w-30 bg-transparent px-3 text-center text-[17px] font-semibold tabular-nums outline-none"
      />
    </div>
  )
}

/** Zeile mit Beschriftung links und Bedienelement rechts. */
export function SettingRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[16px] leading-tight font-semibold">{label}</p>
        {hint && <p className="text-[13px] leading-snug text-ink-soft">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** Abschnitt mit gestrichelter Trennlinie und kleiner Überschrift. */
export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4 border-t-2 border-dashed border-ink/25 pt-3">
      <h3 className="text-[12px] leading-none font-bold tracking-wide text-ink-soft uppercase">{title}</h3>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  )
}
