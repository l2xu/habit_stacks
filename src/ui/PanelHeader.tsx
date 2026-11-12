import type { ReactNode } from 'react'
import { SHEET_TITLE_ID } from './a11y'
import { PixelButton } from './PixelButton'
import { PixelIcon } from './PixelIcon'
import { ARROW, CLOSE } from './sprites'

interface PanelHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  onBack?: () => void
  onClose: () => void
}

/** Kopf eines Sheets: optional Zurück, Titel mit Unterzeile, Schließen. */
export function PanelHeader({ title, subtitle, onBack, onClose }: PanelHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      {onBack && (
        <PixelButton aria-label="Zurück" onClick={onBack} className="size-10 shrink-0">
          <PixelIcon sprite={ARROW} px={2} className="-rotate-90" />
        </PixelButton>
      )}
      <div className="min-w-0 flex-1 pt-1">
        <h2 id={SHEET_TITLE_ID} className="text-[22px] leading-tight font-bold break-words">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[14px] leading-snug text-ink-soft">{subtitle}</p>}
      </div>
      <PixelButton aria-label="Schließen" onClick={onClose} className="size-10 shrink-0">
        <PixelIcon sprite={CLOSE} px={2} />
      </PixelButton>
    </div>
  )
}
