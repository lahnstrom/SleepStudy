import type { InputConfig } from '../../lib/experimentTypes'

function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

export default function MemoryJudgment({ inputConfig }: { inputConfig: InputConfig }) {
  return (
    <div className="memory-prompt">
      <div className="memory-title">Old or New?</div>
      <div className="memory-keys">
        <span className="memory-key-hint">
          <strong>{keyLabel(inputConfig.memoryOldKey)}</strong> = Old
        </span>
        <span className="memory-key-hint">
          <strong>{keyLabel(inputConfig.memoryNewKey)}</strong> = New
        </span>
      </div>
    </div>
  )
}
