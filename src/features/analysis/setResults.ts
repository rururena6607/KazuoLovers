// セット別の結果と得点の推移（要件定義書 F-21）。T-22。表示に出す値を作る純粋な関数。
import type {
  GameSet,
  Player,
  PointCause,
  PointRecord,
  SetRecords,
} from '../../contracts/index.ts'
import { attackStatsOf, receptionStatsOf, serveStatsOf } from '../../lib/stats/index.ts'
import { countCell, playerLabel, rateCell, type AnalysisData, type Cell } from './view.ts'

const byTime = (a: PointRecord, b: PointRecord) => a.recordedAt.localeCompare(b.recordedAt)

const emptySet = (setId: string): SetRecords => ({
  setId,
  serves: [],
  receptions: [],
  attacks: [],
  points: [],
})

/** セットの最終スコア。得点の記録があれば最後の1点のあとの得点、なければセットに保存された得点 */
export function setScoreOf(set: SetRecords, gameSet: GameSet): { our: number; opp: number } {
  const last = [...set.points].sort(byTime).at(-1)
  return last ? { our: last.ourScore, opp: last.oppScore } : { our: gameSet.ourScore, opp: gameSet.oppScore }
}

export interface SetResultRow {
  setId: string
  setNo: number
  /** 例：25-22 */
  score: string
  /** 自チームが勝ったセットなら true、負けなら false、同点（途中）は null */
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
 * ミス数は自チームのサーブミスとアタックの失点（ミス＋被ブロック）の合計
 */
export function setResults(matchId: string, data: AnalysisData): SetResultTable {
  const recordsOf = new Map(data.records.map((r) => [r.setId, r]))
  const rows = data.gameSets
    .filter((gs) => gs.matchId === matchId)
    .sort((a, b) => a.setNo - b.setNo)
    .map((gs): SetResultRow => {
      const set = recordsOf.get(gs.id) ?? emptySet(gs.id)
      const score = setScoreOf(set, gs)
      const serve = serveStatsOf(set.serves)
      const reception = receptionStatsOf(set.receptions)
      const attack = attackStatsOf(set.attacks)
      return {
        setId: gs.id,
        setNo: gs.setNo,
        score: `${score.our}-${score.opp}`,
        won: score.our === score.opp ? null : score.our > score.opp,
        cells: [
          rateCell(serve.efficiency, serve.attempts),
          rateCell(reception.successRate, reception.receptions),
          rateCell(attack.killRate, attack.attempts),
          countCell(serve.misses + attack.errors),
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
  /** その1点が入ったあとの得点 */
  score: string
  /** 何点目か（両チームの合計） */
  no: number
  side: 'us' | 'opp'
  /** 例：「7 渡辺 サービスエース」。選手がいない原因は理由だけ */
  text: string
}

/** セット中の得点の推移。何点目に、誰の何で得点・失点したか */
export function scoreTrend(set: SetRecords, players: readonly Player[]): TrendRow[] {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const playerIdOf = new Map<string, string | null>()
  for (const s of set.serves) playerIdOf.set(s.clientId, s.serverId)
  for (const r of set.receptions) playerIdOf.set(r.clientId, r.receiverId)
  for (const a of set.attacks) playerIdOf.set(a.clientId, a.attackerId)

  return [...set.points].sort(byTime).map((p) => {
    const id = p.sourceId === null ? null : (playerIdOf.get(p.sourceId) ?? null)
    const who = id === null ? '' : `${playerLabel(playerById.get(id))} `
    return {
      score: `${p.ourScore}-${p.oppScore}`,
      no: p.ourScore + p.oppScore,
      side: p.side,
      text: `${who}${CAUSE_LABELS[p.cause]}`,
    }
  })
}
