// チーム・選手・相手・試合・セット（contracts/entities.ts）と、テーブルの行との変換、入力の確かめ。
// 列は supabase/migrations の初期スキーマと同じ。
import type {
  GameSet,
  Match,
  Opponent,
  OpponentPlayer,
  Player,
} from '../../contracts/index.ts'

export interface PlayerRow {
  id: string
  team_id: string
  number: number
  name: string
  position: string | null
  serve_type: Player['serveType']
  active: boolean
}

export interface OpponentRow {
  id: string
  team_id: string
  name: string
}

export interface OpponentPlayerRow {
  id: string
  opponent_id: string
  number: number
}

export interface MatchRow {
  id: string
  team_id: string
  kind: Match['kind']
  opponent_id: string | null
  date: string
  tournament: string | null
  set_points: number
}

export interface SetRow {
  id: string
  match_id: string
  set_no: number
  our_score: number
  opp_score: number
}

export const COLUMNS = {
  players: 'id,team_id,number,name,position,serve_type,active',
  opponents: 'id,team_id,name',
  opponent_players: 'id,opponent_id,number',
  matches: 'id,team_id,kind,opponent_id,date,tournament,set_points',
  sets: 'id,match_id,set_no,our_score,opp_score',
} as const

/** 1試合のセットの数の上限（sets.set_no は 1〜5） */
export const MAX_SETS = 5

export const playerFromRow = (r: PlayerRow): Player => ({
  id: r.id,
  teamId: r.team_id,
  number: r.number,
  name: r.name,
  position: r.position,
  serveType: r.serve_type,
  active: r.active,
})

export const opponentFromRow = (r: OpponentRow): Opponent => ({
  id: r.id,
  teamId: r.team_id,
  name: r.name,
})

export const opponentPlayerFromRow = (r: OpponentPlayerRow): OpponentPlayer => ({
  id: r.id,
  opponentId: r.opponent_id,
  number: r.number,
})

export const matchFromRow = (r: MatchRow): Match => ({
  id: r.id,
  teamId: r.team_id,
  kind: r.kind,
  opponentId: r.opponent_id,
  date: r.date,
  tournament: r.tournament,
  setPoints: r.set_points,
})

export const setFromRow = (r: SetRow): GameSet => ({
  id: r.id,
  matchId: r.match_id,
  setNo: r.set_no,
  ourScore: r.our_score,
  oppScore: r.opp_score,
})

/** 選手を作る・直すときに渡すもの。id がなければ作る */
export type PlayerInput = Omit<Player, 'id' | 'teamId'> & { id?: string }

/** 試合を作るときに渡すもの */
export type MatchInput = Omit<Match, 'id' | 'teamId'>

const isNumber = (n: number) => Number.isInteger(n) && n >= 0 && n <= 99

/** 背番号・名前が正しいか。正しくなければ画面に出す理由を返す */
export function checkPlayer(p: PlayerInput): string | null {
  if (!isNumber(p.number)) return '背番号は 0〜99 で入れてください。'
  const name = p.name.trim()
  if (name === '' || name.length > 50) return '名前は 1〜50 文字で入れてください。'
  return null
}

export function checkOpponentPlayerNumber(n: number): string | null {
  return isNumber(n) ? null : '背番号は 0〜99 で入れてください。'
}

export function checkMatch(m: MatchInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) return '日付を選んでください。'
  if (m.kind === 'practice' && m.opponentId !== null) return '練習には相手を付けません。'
  if (!Number.isInteger(m.setPoints) || m.setPoints < 1 || m.setPoints > 50) {
    return '1セットの点数は 1〜50 で入れてください。'
  }
  return null
}

export const playerToRow = (teamId: string, p: PlayerInput) => ({
  ...(p.id ? { id: p.id } : {}),
  team_id: teamId,
  number: p.number,
  name: p.name.trim(),
  position: p.position?.trim() || null,
  serve_type: p.serveType,
  active: p.active,
})

export const matchToRow = (teamId: string, m: MatchInput) => ({
  team_id: teamId,
  kind: m.kind,
  opponent_id: m.kind === 'practice' ? null : m.opponentId,
  date: m.date,
  tournament: m.tournament?.trim() || null,
  set_points: m.setPoints,
})

/** 次に作るセットの番号。上限に達していれば null */
export function nextSetNo(sets: readonly GameSet[]): number | null {
  const max = sets.reduce((n, s) => Math.max(n, s.setNo), 0)
  return max >= MAX_SETS ? null : max + 1
}

/** 選手を背番号の順に並べる。引退した選手はうしろ */
export function sortPlayers(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => Number(b.active) - Number(a.active) || a.number - b.number)
}

/** Supabase（PostgREST）のエラーを、画面にそのまま出せる日本語にする */
export function toDataErrorMessage(error: { message: string; code?: string }): string {
  switch (error.code) {
    case '23505':
      return 'すでに登録されています（背番号やセットの番号が重なっています）。'
    case '23514':
    case '22P02':
      return '入れた値が正しくありません。'
    case '42501':
      return 'このチームのデータを変える権限がありません。'
  }
  if (/fetch|network/i.test(error.message)) {
    return '通信できませんでした。電波のよい場所でもう一度試してください。'
  }
  return `保存できませんでした（${error.message}）`
}
