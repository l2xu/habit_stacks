import { useMemo } from 'react'
import { faceRect, toPoints, type BoxGeometry } from './iso'
import { mergeShapes, pathOf, shapeOf } from './paint'
import type { FacePalette } from './palette'
import { seededRandom } from './random'

interface IsoBoxProps {
  geo: BoxGeometry
  palette: FacePalette
  /** Seed für die Voxel-Textur (kleine Pixel-Flecken). Ohne Seed: glatte Flächen. */
  textureSeed?: string
  /** Lichtkante oben + Mittelkante; für sehr kleine Boxen abschalten. */
  bevel?: boolean
}

/** Massiver Quader mit drei sichtbaren, flach schattierten Flächen. Ohne eigene Gruppe – spart ein Element je Quader. */
export function IsoBox({ geo, palette, textureSeed, bevel = true }: IsoBoxProps) {
  return (
    <>
      <polygon points={toPoints(geo.left)} fill={palette.left} />
      <polygon points={toPoints(geo.right)} fill={palette.right} />
      <polygon points={toPoints(geo.top)} fill={palette.top} />
      {textureSeed && <FaceTexture geo={geo} seed={textureSeed} />}
      {bevel && (
        <>
          <polyline
            points={toPoints([geo.W1, geo.S1, geo.E1])}
            fill="none"
            stroke="#fff"
            strokeOpacity={0.4}
            strokeWidth={1.5}
          />
          <line
            x1={geo.S1.x}
            y1={geo.S1.y}
            x2={geo.S0.x}
            y2={geo.S0.y}
            stroke={palette.edge}
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        </>
      )}
      <polygon
        points={toPoints(geo.outline)}
        fill="none"
        stroke={palette.edge}
        strokeWidth={1.25}
        strokeLinejoin="round"
      />
    </>
  )
}

/**
 * Mehrere glatte Quader (ohne Bevel und Textur) wie lauter `IsoBox` in dieser Reihenfolge, aber zu wenigen Pfaden
 * zusammengefasst (`mergeShapes`) – für die Mini-Würfel. `geos` stabil halten (useMemo).
 */
export function BoxPaths({ geos, palette, edge = 1.25 }: { geos: BoxGeometry[]; palette: FacePalette; edge?: number }) {
  const paths = useMemo(
    () => mergeShapes(geos.flatMap((g) => [shapeOf('left', g.left), shapeOf('right', g.right), shapeOf('top', g.top), shapeOf('edge', g.outline, edge / 2)])),
    [geos, edge],
  )
  return (
    <>
      {paths.map(({ style, d }, n) =>
        style === 'edge' ? (
          <path key={n} d={d} fill="none" stroke={palette.edge} strokeWidth={edge} strokeLinejoin="round" />
        ) : (
          <path key={n} d={d} fill={palette[style as 'left' | 'right' | 'top']} />
        ),
      )}
    </>
  )
}

/** Ein paar deterministische Pixel-Flecken pro Seitenfläche – gibt den Voxel-Look. Helle und dunkle je ein Pfad. */
export function faceTexture(geo: BoxGeometry, seed: string): { light: string; dark: string } {
  const rand = seededRandom(seed)
  const specks = Array.from({ length: 7 }, () => {
    const side = rand() < 0.55 ? ('left' as const) : ('right' as const)
    const u = 4 + rand() * Math.max(1, geo.faceW - 12)
    const v = 4 + rand() * Math.max(1, geo.height - 10)
    const w = rand() < 0.5 ? 3 : 6
    return { d: pathOf(faceRect(side, side === 'left' ? geo.W1 : geo.S1, u, v, w, 3)), light: rand() < 0.4 }
  })
  const join = (light: boolean) => specks.flatMap((s) => (s.light === light ? [s.d] : [])).join('')
  return { light: join(true), dark: join(false) }
}

function FaceTexture({ geo, seed }: { geo: BoxGeometry; seed: string }) {
  const { light, dark } = useMemo(() => faceTexture(geo, seed), [seed, geo])

  return (
    <>
      {dark && <path d={dark} fill="#000" fillOpacity={0.07} />}
      {light && <path d={light} fill="#fff" fillOpacity={0.12} />}
    </>
  )
}
