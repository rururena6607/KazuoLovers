// 管理画面で出す名前。サーブの種類は要件定義書 5 章「サーブの種類」。
import type { Match, Opponent, ServeType } from '../../contracts/index.ts'

export const SERVE_TYPE_LABELS: Record<ServeType, string> = {
  float: 'フローター',
  jump_float: 'ジャンプフローター',
  jump: 'ジャンプサーブ',
  other: 'その他',
}

export const SERVE_TYPES = Object.keys(SERVE_TYPE_LABELS) as ServeType[]

/** 端末の日付（YYYY-MM-DD）。toISOString は UTC なので、朝9時前は前の日になる */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 試合の種類の名前。紅白戦は、部員だけでやる試合形式（F-27） */
export const MATCH_KIND_LABELS: Record<Match['kind'], string> = {
  match: '試合',
  practice: '練習',
  scrimmage: '紅白戦',
}

/** 一覧に出す名前：試合は相手チーム名、練習と紅白戦はその種類 */
export function matchLabel(m: Pick<Match, 'kind' | 'opponentId'>, opponents: readonly Opponent[]): string {
  if (m.kind !== 'match') return MATCH_KIND_LABELS[m.kind]
  return opponents.find((o) => o.id === m.opponentId)?.name ?? '（相手なし）'
}
