/**
 * Ausblenden in der Detailansicht eines anderen Turms (Turm, Schutthaufen): erst per Opacity, danach ganz
 * aus dem Render-Baum. Nur unsichtbar rechnet der Browser sie samt Beschriftung bei jedem Frame der
 * Kamerafahrt mit. Wird das Ausblenden unterbrochen, greift das `display: none` nicht.
 * Props für ein `motion.*`-Element.
 */
export const fadeAway = (hidden: boolean) =>
  ({
    initial: false,
    animate: hidden ? { opacity: 0, transitionEnd: { display: 'none' } } : { opacity: 1, display: 'inline' },
    // wie CSS `ease`
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  }) as const
