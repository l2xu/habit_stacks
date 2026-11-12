import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose: () => void
  /** id der Überschrift im Inhalt (aria-labelledby). */
  labelledBy: string
  /** Wechselt der Inhalt (z. B. Editor-Ansicht), springt die Scrollposition nach oben. */
  contentKey?: string
  children: ReactNode
}

/**
 * Bottom-Sheet über der App: Abdunklung, Feder von unten, Escape schließt.
 * Hoher Inhalt scrollt innerhalb des Pixel-Rahmens.
 */
export function Sheet({ open, onClose, labelledBy, contentKey, children }: SheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-50 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Schließen" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-ink/35" />
          <SheetBody onClose={onClose} labelledBy={labelledBy} contentKey={contentKey}>
            {children}
          </SheetBody>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SheetBody({ onClose, labelledBy, contentKey, children }: Omit<SheetProps, 'open'>) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // Fokus beim Öffnen in den Dialog holen; Escape schließt. preventScroll: Das Sheet steht beim
  // Öffnen noch unterhalb des Bildschirms – sonst scrollt der Browser die ganze App nach oben.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <motion.section
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="relative flex max-h-full min-h-0 flex-col px-3 pt-[calc(var(--safe-top)+24px)] pb-[calc(var(--safe-bottom)+12px)] outline-none"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 360, damping: 34 }}
    >
      {/* Scrollen im inneren Element – die ::before-Füllung des Rahmens muss stehen bleiben. */}
      <div className="px-frame flex min-h-0 flex-col">
        <div key={contentKey} className="no-scrollbar min-h-0 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </div>
    </motion.section>
  )
}
