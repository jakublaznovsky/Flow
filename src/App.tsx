import type { FileStore } from './storage/fileStore'
import Board, { type BoardApi } from './ui/Board'
import type { Settings } from './ui/settings'

interface Props { store: FileStore; settings: Settings; now?: () => Date; onReady?: (api: BoardApi) => void | (() => void) }

export default function App({ store, settings, now, onReady }: Props) {
  return <Board store={store} settings={settings} now={now} onReady={onReady} />
}
