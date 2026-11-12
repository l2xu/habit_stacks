import { EditBlockView, NewBlockView } from './BlockViews'
import type { EditorRoute } from './blockDraft'
import { NewTowerView } from './NewTowerView'
import { RubbleView } from './RubbleView'
import { TowerView } from './TowerView'

/** Inhalt des Editor-Sheets – eine Ansicht pro Route. */
export function EditorPanel({ route, onNavigate, onClose }: { route: EditorRoute; onNavigate: (route: EditorRoute) => void; onClose: () => void }) {
  switch (route.kind) {
    case 'new-tower':
      return <NewTowerView onCreated={(towerId) => onNavigate({ kind: 'new-block', towerId, first: true })} onClose={onClose} />
    case 'tower':
      return <TowerView towerId={route.towerId} onNavigate={onNavigate} onClose={onClose} />
    case 'new-block':
      return <NewBlockView towerId={route.towerId} first={route.first} onNavigate={onNavigate} onClose={onClose} />
    case 'edit-block':
      return <EditBlockView towerId={route.towerId} habitId={route.habitId} onNavigate={onNavigate} onClose={onClose} />
    case 'rubble':
      return <RubbleView towerId={route.towerId} onNavigate={onNavigate} onClose={onClose} />
  }
}
