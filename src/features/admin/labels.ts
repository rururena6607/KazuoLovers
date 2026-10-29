// 管理画面で出す名前。サーブの種類は要件定義書 5 章「サーブの種類」。
import type { ServeType } from '../../contracts/index.ts'

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
