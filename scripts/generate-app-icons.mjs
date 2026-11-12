// Erzeugt die App-Icons (Home-Bildschirm, PWA): der Mini-Turm aus dem Splash-Screen vor dem Splash-Himmel.
// Rendert dieselben IsoBox-Quader wie `Logo` in Splash.tsx und rastert sie mit headless Chrome.
// Aufruf: node scripts/generate-app-icons.mjs  (braucht Google Chrome; Pfad notfalls über CHROME=… setzen)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createElement as h, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { IsoBox } = await vite.ssrLoadModule('/src/features/world/IsoBox.tsx')
const { boxGeometry } = await vite.ssrLoadModule('/src/features/world/iso.ts')
const { BLOCK_PALETTE } = await vite.ssrLoadModule('/src/features/world/palette.ts')
await vite.close()

// Wie `Logo` in Splash.tsx: Anker, verfestigter Block, Geist obendrauf.
const BLOCKS = [
  { half: 1.5, z: 0, h: 54, color: 'slate' },
  { half: 1.36, z: 54, h: 40, color: 'sky' },
  { half: 1.22, z: 94, h: 40, color: 'mustard' },
]
const tower = renderToStaticMarkup(
  h(Fragment, null, ...BLOCKS.map((b, i) => h(IsoBox, { key: i, geo: boxGeometry(0, 0, b.half, b.z, b.h), palette: BLOCK_PALETTE[b.color], textureSeed: `logo-${i}` }))),
)

// Turm reicht von y ≈ −163 (Spitze) bis +36 (untere Ecke), x ±72. Bei 320 Einheiten Kantenlänge liegt er ganz
// im inneren Kreis (80 %), den runde Android-Masken stehen lassen; iOS rundet nur die Ecken.
const SIZE = 320
const CY = -64
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-SIZE / 2} ${CY - SIZE / 2} ${SIZE} ${SIZE}" width="100%" height="100%">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3d6dd"/><stop offset="0.7" stop-color="#dfe8dc"/><stop offset="1" stop-color="#e6ebda"/></linearGradient></defs>
<rect x="${-SIZE / 2}" y="${CY - SIZE / 2}" width="${SIZE}" height="${SIZE}" fill="url(#sky)"/>
${tower}
</svg>`

const dir = mkdtempSync(join(tmpdir(), 'app-icons-'))
const page = join(dir, 'icon.html')
writeFileSync(page, `<!doctype html><html><body style="margin:0;overflow:hidden">${svg}</body></html>`)

// Chrome hat eine Mindest-Fenstergröße: einmal groß rendern, dann mit sips (macOS) verkleinern.
const big = join(dir, 'icon-1024.png')
execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1024,1024', `--screenshot=${big}`, `file://${page}`], {
  stdio: 'ignore',
})
// Alles im Wurzelverzeichnis, nicht unter /icons/: Apache biegt /icons/ standardmäßig auf seine eigenen
// Symbole um (Alias), dort kämen unsere Icons nie an. Und iOS fragt /apple-touch-icon.png zusätzlich direkt ab.
const OUT = { 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180 }
for (const [name, size] of Object.entries(OUT)) {
  execFileSync('sips', ['-z', String(size), String(size), big, '--out', resolve('public', name)], { stdio: 'ignore' })
}
rmSync(dir, { recursive: true, force: true })
console.log(`App-Icons erzeugt: ${Object.keys(OUT).map((n) => `public/${n}`).join(', ')}`)
