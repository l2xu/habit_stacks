import type { PixelSprite } from './sprites'

interface PixelIconProps {
  sprite: PixelSprite
  /** Kantenlänge eines Sprite-Pixels in CSS-Pixeln. */
  px?: number
  /** Überschreibt einzelne Palettenfarben, z. B. für Zustände. */
  colors?: Record<string, string>
  className?: string
  title?: string
}

/** Rendert ein Zeichen-Raster als knackscharfes SVG; gleiche Zeichen in einer Zeile werden zu einem Rechteck zusammengefasst. */
export function PixelIcon({ sprite, px = 3, colors, className, title }: PixelIconProps) {
  const palette = { ...sprite.colors, ...colors }
  const h = sprite.grid.length
  const w = Math.max(...sprite.grid.map((r) => r.length))
  const rects: { x: number; y: number; w: number; fill: string }[] = []

  sprite.grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const fill = palette[row[x]!]
      if (!fill) {
        x++
        continue
      }
      let end = x + 1
      while (row[end] === row[x]) end++
      rects.push({ x, y, w: end - x, fill })
      x = end
    }
  })

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * px}
      height={h * px}
      shapeRendering="crispEdges"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  )
}
