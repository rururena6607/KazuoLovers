// 得点の表示と操作（要件定義書 6 章「得点とサーブ権」）。
// 得点は1点ずつの PointRecord から数え、サーブ権は最後に得点した側（手動の切替があればそちら）。
import { applyPoint, pointFor } from '../../lib/rally/index.ts'
import {
  DEFAULT_SET_POINTS,
  FINAL_SET_POINTS,
  type PlayRecord,
  type PointCause,
  type PointRecord,
  type RallyState,
  type Side,
} from '../../contracts/index.ts'

/** 得点の記録から、いまの得点を数える */
export function scoreOf(points: readonly PointRecord[]): { ourScore: number; oppScore: number } {
  let ourScore = 0
  let oppScore = 0
  for (const p of points) {
    if (p.side === 'us') ourScore++
    else oppScore++
  }
  return { ourScore, oppScore }
}

/** 手動のサーブ権の切替。atPoints は切り替えたときの得点の数で、次に得点が入ったら無効になる */
export interface ServingOverride {
  serving: Side
  atPoints: number
}

/** いまのサーブ権。セットの最初は自チーム（切替ボタンで変えられる） */
export function servingOf(points: readonly PointRecord[], override: ServingOverride | null): Side {
  if (override && override.atPoints === points.length) return override.serving
  return points.at(-1)?.side ?? 'us'
}

export function rallyStateOf(
  points: readonly PointRecord[],
  override: ServingOverride | null,
): RallyState {
  return { ...scoreOf(points), serving: servingOf(points, override) }
}

/** そのセットの点数。5セット目は FINAL_SET_POINTS */
export const setPointsOf = (setNo: number, matchSetPoints: number = DEFAULT_SET_POINTS): number =>
  setNo === 5 ? FINAL_SET_POINTS : matchSetPoints

/** 得点を1つ足す記録を作る。ourScore・oppScore はその1点が入ったあとの得点 */
export function makePoint(
  state: RallyState,
  side: Side,
  cause: PointCause,
  sourceId: string | null,
  ids: { clientId: string; setId: string; recordedAt: string },
): PointRecord {
  const next = applyPoint(state, side)
  return {
    kind: 'point',
    clientId: ids.clientId,
    setId: ids.setId,
    side,
    cause,
    sourceId,
    ourScore: next.ourScore,
    oppScore: next.oppScore,
    recordedAt: ids.recordedAt,
  }
}

/**
 * 保存した1本で得点が決まるなら、その得点の記録を返す。
 * 同じ1本の得点がもうある（任意項目を付け足しただけ）なら null
 */
export function autoPoint(
  rec: PlayRecord,
  state: RallyState,
  points: readonly PointRecord[],
  ids: { clientId: string; recordedAt: string },
): PointRecord | null {
  if (points.some((p) => p.sourceId === rec.clientId)) return null
  const pf = pointFor(rec)
  if (!pf) return null
  return makePoint(state, pf.side, pf.cause, rec.clientId, { ...ids, setId: rec.setId })
}

/** ラリー中か：最後の1本が A〜D で、そのあとにまだ得点が入っていない */
export function inRally(plays: readonly PlayRecord[], points: readonly PointRecord[]): boolean {
  const last = [...plays].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).at(-1)
  if (!last || pointFor(last) !== null) return false
  const lastPoint = points.at(-1)
  return !lastPoint || lastPoint.recordedAt < last.recordedAt
}

/** −1：その側の最後の得点。なければ null */
export const lastPointOf = (points: readonly PointRecord[], side: Side): PointRecord | null =>
  [...points].reverse().find((p) => p.side === side) ?? null
