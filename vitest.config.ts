import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Eigene Konfiguration ohne PWA/Tailwind-Plugins: Tests prüfen nur die reine Domain-Logik.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
