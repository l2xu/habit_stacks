// Erzeugt favicon.svg aus einem Pixel-Raster (keine Abhängigkeiten).
// Die App-Icons (Home-Bildschirm, PWA) kommen aus scripts/generate-app-icons.mjs.
// Aufruf: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

// Favicon: 16 × 16, nur der Turm – im Browser-Tab wäre die Szene zu klein.
const GRID = [
  '................',
  '................',
  '.....yyyyyy.....',
  '.....YYYYYY.....',
  '.....YYYYYY.....',
  '....bbbbbbbb....',
  '....BBBBBBBB....',
  '....BBBBBBBB....',
  '....BBBBBBBB....',
  '...ssssssssss...',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
  '.gggggggggggggg.',
  '................',
]
const COLORS = {
  '.': '#e6ebda',
  y: '#ecd08a',
  Y: '#d9b263',
  b: '#b6c9d2',
  B: '#94adba',
  s: '#7f8b90',
  S: '#606c72',
  g: '#a6b97b',
}

function svg() {
  const rects = GRID.flatMap((row, y) =>
    [...row].map((ch, x) => (ch === '.' ? '' : `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLORS[ch]}"/>`)),
  ).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="${COLORS['.']}"/>${rects}</svg>\n`
}

mkdirSync('public', { recursive: true })
writeFileSync('public/favicon.svg', svg())
console.log('Favicon erzeugt: public/favicon.svg')
