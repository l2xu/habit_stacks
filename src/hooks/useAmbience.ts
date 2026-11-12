import { useEffect } from 'react'
import { startAmbience, stopAmbience } from '@/lib/ambience'
import { audioContext, audioRunning, wakeAudio } from '@/lib/audio'

/** Ton so früh wie möglich wecken (für Töne und Naturgeräusche), siehe `wakeAudio`. */
export function useAudioWake(enabled: boolean) {
  useEffect(() => (enabled ? wakeAudio() : undefined), [enabled])
}

/**
 * Naturgeräusche an/aus. Laufen, sobald der Ton läuft – beim Start, nach der ersten Berührung oder zurück
 * aus dem Hintergrund – und pausieren, solange die App im Hintergrund ist.
 */
export function useAmbience(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const c = audioContext()
    if (!c) return
    const sync = () => (document.visibilityState === 'visible' && audioRunning(c) ? startAmbience() : stopAmbience())
    c.addEventListener('statechange', sync)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      c.removeEventListener('statechange', sync)
      document.removeEventListener('visibilitychange', sync)
      stopAmbience()
    }
  }, [enabled])
}
