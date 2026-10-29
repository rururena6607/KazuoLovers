// 記録画面のボタンの文字（要件定義書 5 章）。
import type {
  AttackResult,
  AttackType,
  Grade,
  MissType,
  ServeType,
} from '../../contracts/index.ts'

export const SERVE_TYPES: readonly { value: ServeType; label: string }[] = [
  { value: 'float', label: 'フローター' },
  { value: 'jump_float', label: 'ジャンフロ' },
  { value: 'jump', label: 'ジャンプ' },
  { value: 'other', label: 'その他' },
]

export const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D']

export const MISS_TYPES: readonly { value: MissType; label: string }[] = [
  { value: 'net', label: 'ネット' },
  { value: 'out', label: 'アウト' },
  { value: 'other', label: 'その他' },
]

export const ATTACK_TYPES: readonly { value: AttackType; label: string }[] = [
  { value: 'left', label: 'レフト' },
  { value: 'center', label: 'センター' },
  { value: 'right', label: 'ライト' },
  { value: 'back', label: 'バック' },
  { value: 'other', label: 'その他' },
]

/** 5 章「アタックの結果」の4区分 */
export const ATTACK_RESULTS: readonly { value: AttackResult; label: string }[] = [
  { value: 'kill', label: '決定' },
  { value: 'continue', label: '継続' },
  { value: 'error', label: 'ミス' },
  { value: 'blocked', label: '被ブロック' },
]

/** 「7 渡辺」の形（要件定義書 6 章「選手は背番号と名前」） */
export const playerLabel = (p: { number: number; name: string }): string => `${p.number} ${p.name}`
