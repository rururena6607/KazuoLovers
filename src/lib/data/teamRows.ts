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
  /** 紅白戦の B チームの選手にあたる自チームの選手。ふつうの試合は null */
  player_id: string | null
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
  /** 相手コートの列の境目。両方 null ＝ 既定（3 等分） */
  col_split_1: number | null
  col_split_2: number | null
}

export const COLUMNS = {
  players: 'id,team_id,number,name,position,serve_type,active',
  opponents: 'id,team_id,name',
  opponent_players: 'id,opponent_id,number,player_id',
  matches: 'id,team_id,kind,opponent_id,date,tournament,set_points',
  sets: 'id,match_id,set_no,our_score,opp_score,col_split_1,col_split_2',
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
  // 紅白戦のときだけ付く。ふつうの試合は、これまでと同じ形（付けない）
  ...(r.player_id !== null ? { playerId: r.player_id } : {}),
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
  // 両方そろっているときだけ付ける（空は既定の 3 等分。contracts の GameSet）
  ...(r.col_split_1 !== null && r.col_split_2 !== null
    ? { colSplit1: r.col_split_1, colSplit2: r.col_split_2 }
    : {}),
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

/** 紅白戦の B チームの名前。試合ごとに自動で作る（contracts の Match.kind のコメント） */
export const SCRIMMAGE_TEAM_NAME = '紅白戦（B チーム）'

/**
 * 相手チームの一覧から、紅白戦の B チームを除く。
 * B チームは試合ごとに自動で作る内部のものなので、「相手チーム」の一覧や選択肢、「相手」の範囲には出さない。
 * 除くもの：紅白戦の試合が使っている相手チーム。または、既定の名前（「紅白戦（B チーム）」）で、
 * ふつうの試合も練習も使っていないもの（試合の作成や削除が途中で止まって残った B チーム）
 */
export function withoutScrimmageTeams<T extends { id: string; name: string }>(
  opponents: readonly T[],
  matches: readonly { kind: Match['kind']; opponent_id: string | null }[],
): T[] {
  const scrimmage = new Set(matches.filter((m) => m.kind === 'scrimmage').map((m) => m.opponent_id))
  const ordinary = new Set(matches.filter((m) => m.kind !== 'scrimmage').map((m) => m.opponent_id))
  return opponents.filter((o) => !scrimmage.has(o.id) && !(o.name === SCRIMMAGE_TEAM_NAME && !ordinary.has(o.id)))
}

export function checkMatch(m: MatchInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) return '日付を選んでください。'
  if (m.kind === 'practice' && m.opponentId !== null) return '練習には相手を付けません。'
  // B チームは作るときに自動で作る（試合ごと）。ふつうの相手チームを紅白戦に付けると、消すときに巻き込む
  if (m.kind === 'scrimmage' && m.opponentId !== null) return '紅白戦の B チームは自動で作ります（相手を付けません）。'
  if (!Number.isInteger(m.setPoints) || m.setPoints < 1 || m.setPoints > 50) {
    return '1セットの点数は 1〜50 で入れてください。'
  }
  return null
}

/** 紅白戦の B チームで、背番号が別の選手と重なったときの理由（本物の teamData とデモで同じ文） */
export const duplicateNumberMessage = (number: number): string =>
  `紅白戦の B チームに、背番号 ${number} の選手がすでにいます。ほかの背番号で入れてください。`

/** 列の境目が正しいか。0 ≤ 左 < 右 ≤ 1（contracts の GameSet と DB の check と同じ）。正しくなければ理由を返す */
export function checkColSplits(colSplit1: number, colSplit2: number): string | null {
  if (!Number.isFinite(colSplit1) || !Number.isFinite(colSplit2)) return '列の境目の値が正しくありません。'
  if (colSplit1 < 0 || colSplit2 > 1) return '列の境目は、コートの内側（0〜1）に置いてください。'
  if (colSplit1 >= colSplit2) return '左の境目は、右の境目より左に置いてください。'
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
    case 'P0001':
      // migrations の関数が raise exception で出した理由（日本語）。そのまま見せる
      return error.message.endsWith('。') ? error.message : `${error.message}。`
    case 'PGRST116':
      // 1 件のはずが 0 件（ないデータ、または権限がなくて見えない）
      return 'データが見つかりませんでした（ないか、このチームのデータではありません）。'
  }
  if (/fetch|network/i.test(error.message)) {
    return '通信できませんでした。電波のよい場所でもう一度試してください。'
  }
  return `保存できませんでした（${error.message}）`
}
