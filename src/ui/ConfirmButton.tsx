import { useEffect, useState, type ReactNode } from 'react'
import { PixelButton } from './PixelButton'

interface ConfirmButtonProps {
  onConfirm: () => void
  danger?: boolean
  disabled?: boolean
  className?: string
  children: ReactNode
}

/** Zweistufig statt Browser-Dialog: erster Tipp fragt nach, zweiter führt aus. */
export function ConfirmButton({ onConfirm, danger, disabled, className = 'w-28', children }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(id)
  }, [armed])

  return (
    <PixelButton
      disabled={disabled}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={`h-10 shrink-0 text-[15px] font-semibold ${className} ${armed && danger ? 'px-danger text-paper' : armed ? 'px-gold' : ''}`}
    >
      {armed ? 'Sicher?' : children}
    </PixelButton>
  )
}
