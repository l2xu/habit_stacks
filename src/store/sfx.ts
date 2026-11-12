import { playSfx, type Sfx } from '@/lib/feedback'
import { useAppStore } from './useAppStore'

/** Effekt abspielen, wenn „Töne“ an ist – für Stellen ohne eigenen Zugriff auf die Einstellungen. */
export const sfx = (name: Sfx, pitch?: number) => playSfx(name, useAppStore.getState().settings.sound, pitch)
