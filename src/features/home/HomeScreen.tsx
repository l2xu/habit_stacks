import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ID } from '@/domain/types'
import { DevPanel } from '@/features/dev/DevPanel'
import type { EditorRoute } from '@/features/editor/blockDraft'
import { EditorPanel } from '@/features/editor/EditorPanel'
import { NewsPanel } from '@/features/news/NewsPanel'
import { useNews } from '@/features/news/useNews'
import { SettingsPanel } from '@/features/settings/SettingsPanel'
import { baseAltOf, dropEnd } from '@/features/world/worldLayout'
import { useSafeArea } from '@/hooks/useSafeArea'
import { useToday } from '@/hooks/useToday'
import { sfx } from '@/store/sfx'
import { useTowerVMs } from '@/store/selectors'
import { useAppStore } from '@/store/useAppStore'
import { SHEET_TITLE_ID } from '@/ui/a11y'
import { PixelButton } from '@/ui/PixelButton'
import { Sheet } from '@/ui/Sheet'
import { FocusDock } from './FocusDock'
import { HeightRuler } from './HeightRuler'
import { StreakPanel } from './StreakPanel'
import { TOP_BAR_H, TopBar } from './TopBar'
import { WorldStage } from './WorldStage'

/** Höhe von Streak und Wochenleiste unter der Kopfzeile (Detailansicht). */
const STREAK_H = 74
/** Countdown-Zeile unter der Warnung, solange Blöcke bröckeln. */
const FALL_LINE_H = 18
/** Bis knapp über die Dock-Oberkante darf der Turm reichen. */
const DOCK_INSET = 118
/** Solange eine Neuigkeit offen ist, rückt der Turm über das Panel, damit die Animation sichtbar bleibt. */
const NEWS_SPACE = 150
/** Übersicht: Platz für den Bedienhinweis am unteren Rand. */
const HINT_INSET = 44

/** Was im Bottom-Sheet liegt: Editor-Ansicht, Einstellungen oder DevTools (vorübergehend). */
type SheetRoute = EditorRoute | { kind: 'settings' } | { kind: 'dev'; towerId: ID | null }

/**
 * Zwei Ansichten derselben Insel: Übersicht (alle Türme mit Name und Höhe) und Detailansicht
 * (Kamera auf einem Turm, dazu Wochenleiste, Lineal und Fokus-Dock). Antippen öffnet einen Turm,
 * gedrückt halten öffnet den Editor.
 */
export function HomeScreen({ introDone }: { introDone: boolean }) {
  const today = useToday()
  const towers = useTowerVMs(today)
  const selectedId = useAppStore((s) => s.ui.selectedTowerId)
  const view = useAppStore((s) => s.ui.view)
  const focusOpen = useAppStore((s) => s.focus !== null)
  const openTower = useAppStore((s) => s.openTower)
  const showOverview = useAppStore((s) => s.showOverview)
  const startFocus = useAppStore((s) => s.startFocus)
  const resumeTower = useAppStore((s) => s.resumeTower)
  const showToast = useAppStore((s) => s.showToast)
  const markEventsSeen = useAppStore((s) => s.markEventsSeen)
  const [sheet, setSheet] = useState<SheetRoute | null>(null)
  const openSheet = (route: SheetRoute) => {
    sfx('open')
    setSheet(route)
  }
  const closeSheet = () => {
    sfx('close')
    setSheet(null)
  }
  const tapTower = useCallback(
    (id: ID) => {
      sfx('tap')
      openTower(id)
    },
    [openTower],
  )
  const backToOverview = () => {
    sfx('close')
    showOverview()
  }

  const open = view === 'tower' ? (towers.find((t) => t.id === selectedId) ?? null) : null

  const editTower = useCallback((towerId: ID) => {
    sfx('open')
    setSheet({ kind: 'tower', towerId })
  }, [])
  const openRubble = useCallback((towerId: ID) => {
    sfx('open')
    setSheet({ kind: 'rubble', towerId })
  }, [])
  const swipe = useCallback(
    (dir: 1 | -1) => {
      const next = towers[towers.findIndex((t) => t.id === open?.id) + dir]
      if (!open || !next) return
      sfx('swipe')
      openTower(next.id)
    },
    [towers, open, openTower],
  )

  // ── Neuigkeiten aus der Regel-Engine: erst wenn das Startbild weg ist und alle Blöcke gelandet sind,
  // sonst fährt die Kamera mitten in die Fall-Animation. ──
  const news = useNews(today)
  const [seenHere, setSeenHere] = useState(0)
  const mountedAt = useRef(performance.now())
  const [settled, setSettled] = useState(false)
  const landedMs = dropEnd(towers) * 1000
  useEffect(() => {
    if (!introDone || settled) return
    const t = window.setTimeout(() => setSettled(true), landedMs - (performance.now() - mountedAt.current))
    return () => window.clearTimeout(t)
  }, [introDone, settled, landedMs])
  const current = settled ? news.current : null
  const currentId = current?.event.id
  const currentTowerId = current?.event.towerId
  const effect = useMemo(() => (current?.effect ? { towerId: current.event.towerId, effect: current.effect } : null), [current])
  useEffect(() => {
    if (news.silentIds.length) markEventsSeen(news.silentIds)
  }, [news.silentIds, markEventsSeen])
  // Jede Neuigkeit fährt die Kamera auf ihren Turm; danach zählt die Queue wieder von vorn.
  useEffect(() => {
    if (currentTowerId) openTower(currentTowerId)
    else setSeenHere(0)
  }, [currentId, currentTowerId, openTower])
  const nextNews = () => {
    if (!current) return
    markEventsSeen([current.event.id])
    setSeenHere((n) => n + 1)
    // Heute fest geworden: auf dem Turm bleiben, damit gleich das Plus für den nächsten Block erscheint.
    const solidifiedToday = current.event.type === 'block_solidified' && current.event.date === today
    if (news.pendingIds.length <= 1 && !solidifiedToday) showOverview()
  }

  // ── Tastatur in der Detailansicht: Escape = Übersicht, Pfeile = Nachbarturm ──
  useEffect(() => {
    if (!open || sheet || focusOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') backToOverview()
      else if (e.key === 'ArrowLeft') swipe(-1)
      else if (e.key === 'ArrowRight') swipe(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, sheet, focusOpen, showOverview, swipe])

  const isOpen = open !== null
  const hasNews = current !== null
  const safe = useSafeArea()
  const streakH = STREAK_H + (open && open.fallIn !== null ? FALL_LINE_H : 0)
  const insets = useMemo(
    () => ({
      top: safe.top + TOP_BAR_H + (isOpen ? streakH : 0) + 6,
      bottom: safe.bottom + (isOpen ? DOCK_INSET + (hasNews ? NEWS_SPACE : 0) : HINT_INSET),
    }),
    [isOpen, streakH, hasNews, safe],
  )
  const addTower = () => openSheet({ kind: 'new-tower' })

  return (
    <>
      <main className="relative min-h-0 flex-1">
        {towers.length > 0 ? (
          <WorldStage
            towers={towers}
            openId={open?.id ?? null}
            homeId={selectedId}
            insets={insets}
            effect={effect}
            onOpen={tapTower}
            onEdit={editTower}
            onRubble={openRubble}
            onStack={hasNews ? undefined : (towerId) => openSheet({ kind: 'new-block', towerId })}
            onSwipe={swipe}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-[22px] font-semibold">Leg deinen ersten Anker.</p>
            <p className="text-ink-soft">
              Ein Turm beginnt mit einer Gewohnheit, die du schon jeden Tag machst. Darauf stapelst du neue – eine nach der anderen.
            </p>
            <div className="grid w-full max-w-64 gap-2">
              <PixelButton variant="go" onClick={addTower} className="h-12 px-5 text-[17px] font-semibold text-paper">
                Ersten Turm bauen
              </PixelButton>
            </div>
          </div>
        )}

        {/* Kopfzeile: nur die Knöpfe fangen Tipps ab, sonst darf man darunter wischen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 pt-(--safe-top)">
          <TopBar
            tower={open}
            onBack={backToOverview}
            onEdit={() => open && editTower(open.id)}
            onSettings={() => openSheet({ kind: 'settings' })}
            onAdd={addTower}
          />
          <AnimatePresence>
            {open && (
              <motion.div key="streak" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <StreakPanel tower={open} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div key="ruler" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <HeightRuler
                level={open.blocks.length}
                baseAlt={baseAltOf(towers.indexOf(open))}
                className="right-2 bottom-[calc(var(--dock-h)+4px)]"
                style={{ top: safe.top + TOP_BAR_H + streakH + 8 }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {current && (
            <NewsPanel
              key={current.event.id}
              item={current}
              index={seenHere + 1}
              total={seenHere + news.pendingIds.length}
              onNext={nextNews}
              onSkipAll={() => {
                markEventsSeen(news.pendingIds)
                showOverview()
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {open && (
            <motion.div
              key="dock"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
              initial={{ y: '110%' }}
              animate={{ y: 0 }}
              exit={{ y: '110%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <FocusDock
                tower={open}
                onStart={() => startFocus(open.id, today)}
                onResume={() => {
                  resumeTower(open.id, today)
                  showToast(`${open.name} läuft wieder – ab heute zählt jeder Tag.`)
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!open && towers.length > 0 && (
            <motion.p
              key="hint"
              className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+12px)] z-10 flex justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="px-frame px-3 pt-1.5 pb-2 text-[13px] leading-none text-ink-soft [--px:2px]">
                Antippen: ansehen · Halten: bearbeiten
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </main>

      <Sheet open={sheet !== null} onClose={closeSheet} labelledBy={SHEET_TITLE_ID} contentKey={sheet ? JSON.stringify(sheet) : undefined}>
        {sheet?.kind === 'settings' ? (
          <SettingsPanel onClose={closeSheet} onDev={() => openSheet({ kind: 'dev', towerId: null })} />
        ) : sheet?.kind === 'dev' ? (
          <DevPanel towerId={sheet.towerId} onClose={closeSheet} />
        ) : (
          sheet && <EditorPanel route={sheet} onNavigate={setSheet} onClose={closeSheet} />
        )}
      </Sheet>
    </>
  )
}
