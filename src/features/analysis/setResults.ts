// セット別の結果と得点の推移（要件定義書 F-21）。T-22。表示に出す値を作る純粋な関数。
import {
  DEFAULT_SET_POINTS,
  FINAL_SET_POINTS,
  type GameSet,
  type Player,
  type PointCause,
  type PointRecord,
  type Side,
  type SetRecords,
} from '../../contracts/index.ts'
import { setWinner } from '../../lib/rally/index.ts'
import { summaryOf } from '../../lib/stats/index.ts'
import { countCell, playerLabel, rateCell, type AnalysisData, type Cell } from './view.ts'

const byTime = (a: PointRecord, b: PointRecord) => a.recordedAt.localeCompare(b.recordedAt)

export const emptySet = (setId: string): SetRecords => ({
  setId,
  serves: [],
  receptions: [],
  attacks: [],
  points: [],
})

/** 最終セットのセット番号。記録画面（T-13）と同じく、このセットだけ FINAL_SET_POINTS で数える */
const FINAL_SET_NO = 5

/** そのセットの点数。5 セット目は FINAL_SET_POINTS。試合の値が正の整数でなければ初期値 */
export function setPointsOf(setNo: number, matchSetPoints: number): number {
  if (setNo === FINAL_SET_NO) return FINAL_SET_POINTS
  return Number.isInteger(matchSetPoints) && matchSetPoints > 0 ? matchSetPoints : DEFAULT_SET_POINTS
}

/**
 * セットの得点。得点の記録（points）があれば、記録画面と同じく side ごとに数える。
 * 記録に保存された ourScore・oppScore は使わない（−1 で途中の得点を消すと、あとの記録の値が古くなるため）。
 * 記録がなければ、セットに保存された得点
 */
export function setScoreOf(set: SetRecords, gameSet: GameSet): { our: number; opp: number } {
  if (set.points.length === 0) return { our: gameSet.ourScore, opp: gameSet.oppScore }
  const our = set.points.filter((p) => p.side === 'us').length
  return { our, opp: set.points.length - our }
}

export interface SetResultRow {
  setId: string
  setNo: number
  /** 例：25-22 */
  score: string
  /** 自チームが勝ったセットなら true、負けなら false、まだ終わっていないセットは null */
  won: boolean | null
  cells: Cell[]
}

export interface SetResultTable {
  columns: string[]
  rows: SetResultRow[]
}

const SET_RESULT_COLUMNS = ['サーブ効果率', 'サーブレシーブ成功率', 'アタック決定率', 'ミス数']

/**
 * 試合のセット別の結果。セットごとの得点と、サーブ効果率・サーブレシーブ成功率・アタック決定率・ミス数。
 * ミス数は自チームのサーブミスとアタックのミスの合計。被ブロックは、要件定義書 5 章でミスと分けているので入れない
 * （アタックの失点はアタック決定率の表の「失点」で見る）
 */
export function setResults(matchId: string, data: AnalysisData): SetResultTable {
  const recordsOf = new Map(data.records.map((r) => [r.setId, r]))
  const match = data.matches.find((m) => m.id === matchId)
  const rows = data.gameSets
    .filter((gs) => gs.matchId === matchId)
    .sort((a, b) => a.setNo - b.setNo)
    .map((gs): SetResultRow => {
      const set = recordsOf.get(gs.id) ?? emptySet(gs.id)
      const score = setScoreOf(set, gs)
      const winner = setWinner(
        { ourScore: score.our, oppScore: score.opp, serving: 'us' },
        setPointsOf(gs.setNo, match?.setPoints ?? DEFAULT_SET_POINTS),
      )
      const { serve, reception, attack } = summaryOf(set)
      const attackErrors = set.attacks.filter((a) => a.result === 'error').length
      return {
        setId: gs.id,
        setNo: gs.setNo,
        score: `${score.our}-${score.opp}`,
        won: winner === null ? null : winner === 'us',
        cells: [
          rateCell(serve.efficiency, serve.attempts),
          rateCell(reception.successRate, reception.receptions),
          rateCell(attack.killRate, attack.attempts),
          countCell(serve.misses + attackErrors),
        ],
      }
    })
  return { columns: SET_RESULT_COLUMNS, rows }
}

// ---- 得点の推移 ----

export const CAUSE_LABELS: Record<PointCause, string> = {
  ace: 'サービスエース',
  serve_miss: 'サーブミス',
  opp_miss: '相手のサーブミス',
  aced: '被エース',
  kill: 'アタック決定',
  attack_error: 'アタックミス',
  blocked: '被ブロック',
  manual: 'ラリー',
}

export interface TrendRow {
  /** 得点の記録の clientId（React の key） */
  id: string
  /** 何点目か（並べたあとの位置。両チームの合計） */
  no: number
  /** その1点が入ったあとの得点（side を数えて出す） */
  score: string
  side: Side
  /** 例：「7 渡辺 サービスエース」。選手がいない原因は理由だけ */
  text: string
}

/**
 * セット中の得点の推移。何点目に、誰の何で得点・失点したか。
 * 点数は記録に保存された値ではなく、並べた順に side を数えて出す（−1 で途中の得点が消えても番号が飛ばない）
 */
export function scoreTrend(set: SetRecords, players: readonly Player[]): TrendRow[] {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const playerIdOf = new Map<string, string | null>()
  for (const s of set.serves) playerIdOf.set(s.clientId, s.serverId)
  for (const r of set.receptions) playerIdOf.set(r.clientId, r.receiverId)
  for (const a of set.attacks) playerIdOf.set(a.clientId, a.attackerId)

  let our = 0
  let opp = 0
  return [...set.points].sort(byTime).map((p, index) => {
    if (p.side === 'us') our++
    else opp++
    const id = p.sourceId === null ? null : (playerIdOf.get(p.sourceId) ?? null)
    const who = id === null ? '' : `${playerLabel(playerById.get(id))} `
    return {
      id: p.clientId,
      no: index + 1,
      score: `${our}-${opp}`,
      side: p.side,
      text: `${who}${CAUSE_LABELS[p.cause]}`,
    }
  })
}
