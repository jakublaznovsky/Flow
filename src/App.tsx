import type { AiClient } from './ai/claude'
import type { FileStore } from './storage/fileStore'
import Board, { type BoardApi } from './ui/Board'
import type { Settings } from './ui/settings'
import type { ShortcutStatus } from './shortcut'

interface Props {
  store: FileStore
  settings: Settings
  now?: () => Date
  onReady?: (api: BoardApi) => void | (() => void)
  /** Claude client for an API key (tests and the browser dev fake); defaults to the real SDK. */
  ai?: (apiKey: string) => AiClient
  /** Quick-capture shortcut state (Tauri only); omitted in the browser, so Settings shows no line. */
  shortcut?: ShortcutStatus
}

export default function App({ store, settings, now, onReady, ai, shortcut }: Props) {
  return <Board store={store} settings={settings} now={now} onReady={onReady} ai={ai} shortcut={shortcut} />
}
