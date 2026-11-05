// 得点の表示と操作（要件定義書 6 章「得点とサーブ権」）。
// 得点は1点ずつの PointRecord から数え、サーブ権は最後に得点した側（手動の切替があればそちら）。
// 表示する得点はいつも記録の数から数え直す。PointRecord の ourScore・oppScore は記録したときの得点。
import { applyPoint, pointFor, setWinner } from '../../lib/rally/index.ts'
import {
  DEFAULT_SET_POINTS,
  FINAL_SET_POINTS,
  type PlayRecord,
  type PointCause,
  type PointRecord,
  type RallyState,
  type Side,
} from '../../contracts/index.ts'

/** 記録した時刻の順に並べる比較関数 */
export const byRecordedAt = (a: { recordedAt: string }, b: { recordedAt: string }): number =>
  a.recordedAt.localeCompare(b.recordedAt)

/** 時刻順に並んだ配列いくつかから、いちばん新しい1件。並べ替えずに各配列の最後だけを比べる */
export function latestOf<T extends { recordedAt: string }>(
  ...lists: readonly (readonly T[])[]
): T | null {
  let latest: T | null = null
  for (const list of lists) {
    const last = list.at(-1)
    if (last && (latest === null || byRecordedAt(last, latest) > 0)) latest = last
  }
  return latest
}

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

/**
 * そのセットの点数。試合の最後のセット（5セットマッチなら第5、3セットマッチなら第3）は FINAL_SET_POINTS。
 * totalSets は試合のセットの数（管理画面で作ったセット）
 */
export const setPointsOf = (
  setNo: number,
  totalSets: number,
  matchSetPoints: number = DEFAULT_SET_POINTS,
): number => (setNo === totalSets ? FINAL_SET_POINTS : matchSetPoints)

/** 試合に勝った側。どちらかが過半数のセットを取ったら決まる。まだなら null */
export function matchWinner(setWinners: readonly (Side | null)[], totalSets: number): Side | null {
  const need = Math.floor(totalSets / 2) + 1
  const won = (side: Side) => setWinners.filter((w) => w === side).length
  if (won('us') >= need) return 'us'
  if (won('opp') >= need) return 'opp'
  return null
}

/** セットごとの勝った側（終わっていないセットは null） */
export const setWinnersOf = (
  pointsBySet: readonly (readonly PointRecord[])[],
  totalSets: number,
  matchSetPoints: number,
): (Side | null)[] =>
  pointsBySet.map((points, i) =>
    setWinner(rallyStateOf(points, null), setPointsOf(i + 1, totalSets, matchSetPoints)),
  )

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
 * 新しく保存した1本で得点が決まるなら、その得点の記録を返す。
 * 付け足し（同じ clientId の上書き）では呼ばない。−1 で消した得点が戻ってしまうため。
 * 念のため、同じ1本の得点がもうあれば null
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
export function inRally(lastPlay: PlayRecord | null, points: readonly PointRecord[]): boolean {
  if (!lastPlay || pointFor(lastPlay) !== null) return false
  const lastPoint = points.at(-1)
  return !lastPoint || lastPoint.recordedAt < lastPlay.recordedAt
}

/** −1：その側の最後の得点。なければ null */
export const lastPointOf = (points: readonly PointRecord[], side: Side): PointRecord | null =>
  [...points].reverse().find((p) => p.side === side) ?? null
