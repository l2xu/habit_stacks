import type { ButtonHTMLAttributes } from 'react'

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'stone' | 'go' | 'paper'
}

/** Blockiger Button mit Pixel-Ecken und Bevel; drückt sich beim Antippen ein. */
export function PixelButton({ variant = 'stone', className = '', type = 'button', ...rest }: PixelButtonProps) {
  const tone = variant === 'paper' ? '' : `px-${variant}`
  return (
    <button
      type={type}
      className={`px-frame px-button ${tone} inline-flex items-center justify-center ${className}`}
      {...rest}
    />
  )
}
