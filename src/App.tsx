import type { FileStore } from './storage/fileStore'
import Board from './ui/Board'
import type { Settings } from './ui/settings'

interface Props { store: FileStore; settings: Settings; now?: () => Date }

export default function App({ store, settings, now }: Props) {
  return <Board store={store} settings={settings} now={now} />
}
