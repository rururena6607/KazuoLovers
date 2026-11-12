// 記録画面のコート図に出す、直前のサーブの着弾点（F-22「記録画面は直前の数本」）。
// 選手ごとの色で描き、点の中に背番号を書く。本数はガブが決めた（5本）。
import type { Player, ServeRecord } from '../../contracts/index.ts'
import type { CourtMark } from '../../components/Court.tsx'
import { byRecordedAt } from './score.ts'

/** 記録画面に出す直前のサーブの本数 */
export const RECENT_SERVE_MARKS = 5

/**
 * 直前のサーブの着弾点。着弾点のないサーブ（ネットなど）は数えない。古い順に返す（新しい点を上に描く）
 * players は引退した選手も含める（背番号を出すため）
 */
export function recentServeMarks(
  serves: readonly ServeRecord[],
  players: readonly Player[],
  colors: ReadonlyMap<string, string>,
  count: number = RECENT_SERVE_MARKS,
): CourtMark[] {
  const numberOf = new Map(players.map((p) => [p.id, p.number]))
  return [...serves]
    .filter((s) => s.toX !== null && s.toY !== null)
    .sort(byRecordedAt)
    .slice(-count)
    .flatMap((s) => {
      const color = colors.get(s.serverId)
      const number = numberOf.get(s.serverId)
      if (s.toX === null || s.toY === null || color === undefined || number === undefined) return []
      return [{ x: s.toX, y: s.toY, color, label: String(number) }]
    })
}
