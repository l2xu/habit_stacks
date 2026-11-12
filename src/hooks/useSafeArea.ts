import { useEffect, useState } from 'react'

/**
 * Safe-Area-Abstände (Notch, Home-Indikator) in px – für Rechnungen, die CSS nicht übernehmen kann,
 * z. B. die Kamera der Insel. Im CSS direkt `var(--safe-top)` / `var(--safe-bottom)` verwenden.
 */
export function useSafeArea() {
  const [area, setArea] = useState({ top: 0, bottom: 0 })
  useEffect(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:var(--safe-top);padding-bottom:var(--safe-bottom)'
    document.body.appendChild(probe)
    const measure = () => {
      const cs = getComputedStyle(probe)
      const next = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }
      setArea((a) => (a.top === next.top && a.bottom === next.bottom ? a : next))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      probe.remove()
    }
  }, [])
  return area
}
