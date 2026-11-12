import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

/** Build-Zeitpunkt im Format der Release-Commits („Build 2026-11-03 10:15“), damit man beides zuordnen kann. */
function buildStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// https://vite.dev/config/
export default defineConfig({
  // In den Einstellungen sichtbar: welche Version gerade läuft.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // `npm run release` gibt den Zeitstempel seines Commits mit.
    __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME ?? buildStamp()),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Habit Stacks',
        short_name: 'Habit Stacks',
        description: 'Gewohnheiten stapeln – Block für Block.',
        lang: 'de',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#e6ebda',
        theme_color: '#e6ebda',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        // Push-Nachrichten anzeigen und antippen (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  // Push-Dienst lokal: `npm run push:dev` startet PHP auf Port 8787 (gilt auch für `vite preview`).
  server: {
    proxy: { '/push/': 'http://localhost:8787' },
  },
})
