export default function FolderSetup({ onChoose }: { onChoose(): void }) {
  return (
    <div className="app">
      <h1>Flow</h1>
      <button onClick={onChoose}>Choose or create your Flow folder</button>
    </div>
  )
}
