import type { Speed } from '../../contracts/index.ts'
import { SPEEDS, toggle } from './labels.ts'

// 速さ（F-26）。任意で、1タップで選ぶ。押し直すと外す。入れなくても結果ボタンで確定できる。

interface Props {
  value: Speed | null
  onChange: (speed: Speed | null) => void
}

export default function SpeedPicker({ value, onChange }: Props) {
  return (
    <div className="row" role="group" aria-label="速さ（任意）">
      <span className="chips-label">速さ</span>
      {SPEEDS.map((s) => (
        <button
          key={s.value}
          type="button"
          className="btn btn-sm"
          aria-pressed={value === s.value}
          onClick={() => onChange(toggle(value, s.value))}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
