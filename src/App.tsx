import type { AiClient } from './ai/claude'
import type { FileStore } from './storage/fileStore'
import Board, { type BoardApi } from './ui/Board'
import type { Settings } from './ui/settings'

interface Props {
  store: FileStore
  settings: Settings
  now?: () => Date
  onReady?: (api: BoardApi) => void | (() => void)
  /** Claude client for an API key (tests and the browser dev fake); defaults to the real SDK. */
  ai?: (apiKey: string) => AiClient
}

export default function App({ store, settings, now, onReady, ai }: Props) {
  return <Board store={store} settings={settings} now={now} onReady={onReady} ai={ai} />
}
