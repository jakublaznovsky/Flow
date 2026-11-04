import { useState } from 'react'
import { AI_MODELS, type AiModel } from '../ai/claude'

interface Props {
  hasKey: boolean
  model: AiModel
  onSaveKey: (key: string) => void
  onRemoveKey: () => void
  onModel: (model: AiModel) => void
}

/** Settings view: the owner's Claude API key and model. The key is never shown again once saved. */
export default function SettingsPanel({ hasKey, model, onSaveKey, onRemoveKey, onModel }: Props) {
  const [draft, setDraft] = useState('')
  return (
    <section className="settings-view" aria-label="Settings">
      <div className="settings-card">
        <h2>Settings</h2>
        <h3>Claude</h3>
        <form
          className="settings-field"
          onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onSaveKey(draft.trim()); setDraft('') } }}
        >
          <label htmlFor="settings-api-key">Claude API key</label>
          <div className="settings-row">
            <input
              id="settings-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={hasKey ? 'Paste a new key to replace it' : 'sk-ant-…'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn primary" disabled={!draft.trim()}>Save</button>
            {hasKey && <button type="button" className="btn" onClick={onRemoveKey}>Remove</button>}
          </div>
          {hasKey && <p className="settings-status">A key is saved on this computer.</p>}
        </form>
        <div className="settings-field">
          <label htmlFor="settings-model">Model</label>
          <select id="settings-model" value={model} onChange={(e) => onModel(e.target.value as AiModel)}>
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <p className="settings-privacy">
          Your key stays on this computer, in Flow's own settings, never in your Flow folder. Pressing an AI button
          sends the Flow data in that request (recent days, tasks, projects and notes) to Anthropic.
        </p>
      </div>
    </section>
  )
}
