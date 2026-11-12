import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'

/** Kurze Pixel-Meldung über dem Fokus-Dock; verschwindet nach 2,4 s. */
export function Toast() {
  const toast = useAppStore((s) => s.ui.toast)
  const dismiss = useAppStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(dismiss, 2400)
    return () => window.clearTimeout(id)
  }, [toast, dismiss])

  return (
    // Über Sheets (z-50) – sonst gehen Meldungen aus Editor und Einstellungen unsichtbar unter.
    <div className="pointer-events-none absolute inset-x-4 bottom-[calc(var(--dock-h)+12px)] z-60 flex justify-center" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="px-frame px-4 py-2.5 text-[15px] font-medium"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
