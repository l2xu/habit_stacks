import type { ReactNode } from 'react'
import { Toast } from './Toast'

/**
 * Äußerer App-Rahmen: Telefonbreite, volle Höhe. Die Welt reicht bis unter Notch und Home-Indikator;
 * die Safe-Areas berücksichtigen die Bedienelemente selbst (`--safe-top`, `--safe-bottom`).
 * Die Statusleiste ist durchsichtig (`black-translucent`); ein weicher Schatten unter Uhr und Akku hält
 * sie auf hellem Himmel lesbar. Ohne Notch ist er 0 px hoch. Dass iOS den Viewport dabei zu kurz misst,
 * fängt index.css ab (`display-mode: standalone`).
 * Auf großen Bildschirmen wird der Rahmen mittig als "Gerät" dargestellt.
 * overflow-clip statt -hidden: Der Rahmen lässt sich auch programmatisch nicht scrollen (z. B. per focus()).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 flex justify-center md:items-center md:py-6">
      <div
        className="relative flex h-full w-full max-w-[440px] flex-col overflow-clip bg-haze md:h-[min(900px,100%)] md:shadow-[0_0_0_4px_var(--color-ink),8px_8px_0_4px_rgba(47,56,51,0.25)]"
      >
        {children}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-50 h-(--safe-top) bg-linear-to-b from-ink/35 to-transparent"
        />
        <Toast />
      </div>
    </div>
  )
}
