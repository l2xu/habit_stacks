import type { CSSProperties } from 'react'
import { ALTITUDE_ZONES, MAX_RULER_LEVEL, zToLevel } from '@/features/world/altitude'

const pct = (level: number) => `${(Math.min(Math.max(level, 0), MAX_RULER_LEVEL) / MAX_RULER_LEVEL) * 100}%`

interface HeightRulerProps {
  level: number
  /** Höhe des Turmfußes über der Grundlinie – hintere Türme erreichen die Schichten früher. */
  baseAlt: number
  className?: string
  style?: CSSProperties
}

/**
 * Höhenlineal am rechten Rand: Zonen-Bänder (Wiese → Sterne) und Markierung
 * der aktuellen Höhe. Home: Turmhöhe; Fokus-Modus: Ebene des aktiven Blocks.
 * Position (top/bottom/right) kommt vom Aufrufer.
 */
export function HeightRuler({ level, baseAlt, className = '', style }: HeightRulerProps) {
  return (
    <div
      className={`pointer-events-none absolute z-10 w-[18px] ${className}`}
      style={style}
      role="img"
      aria-label={`Turmhöhe: ${level} Blöcke`}
    >
      <div className="absolute inset-0 overflow-hidden border-2 border-ink/60 bg-paper/80">
        {ALTITUDE_ZONES.map((zone, i) => {
          const from = zToLevel(zone.alt - baseAlt)
          const next = ALTITUDE_ZONES[i + 1]
          const to = next ? zToLevel(next.alt - baseAlt) : MAX_RULER_LEVEL
          return (
            <div
              key={zone.id}
              className="absolute inset-x-0 opacity-35"
              style={{ bottom: pct(from), height: `calc(${pct(to)} - ${pct(from)})`, background: zone.rulerColor }}
            />
          )
        })}
        <div className="absolute inset-x-0 bottom-0 bg-moss transition-[height] duration-500" style={{ height: pct(level) }} />
        <div
          className="absolute inset-y-0 left-0 w-1/2"
          style={{
            backgroundImage: `repeating-linear-gradient(to top, rgba(47,56,51,0.45) 0 1px, transparent 1px calc(100% / ${MAX_RULER_LEVEL}))`,
          }}
        />
      </div>
      <div
        className="absolute -left-[22px] flex translate-y-1/2 items-center gap-[2px] transition-[bottom] duration-500 ease-out"
        style={{ bottom: pct(level) }}
      >
        <span className="px-frame px-[5px] py-[3px] font-micro text-[10px] leading-none [--px:2px]">{level}</span>
        <span className="size-0 border-y-[5px] border-l-[6px] border-y-transparent border-l-ink" />
      </div>
    </div>
  )
}
