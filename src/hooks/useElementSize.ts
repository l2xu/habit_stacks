import { useEffect, useRef, useState } from 'react'

/**
 * Größe eines Elements per ResizeObserver.
 * 'content' = ohne Padding (Standard), 'border' = inklusive Padding und Rahmen.
 */
export function useElementSize<T extends HTMLElement>(box: 'content' | 'border' = 'content') {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const border = entry.borderBoxSize?.[0]
      setSize(
        box === 'border' && border
          ? { width: border.inlineSize, height: border.blockSize }
          : { width: entry.contentRect.width, height: entry.contentRect.height },
      )
    })
    observer.observe(el, { box: box === 'border' ? 'border-box' : 'content-box' })
    return () => observer.disconnect()
  }, [box])

  return [ref, size] as const
}
