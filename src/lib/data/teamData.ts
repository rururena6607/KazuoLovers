// 管理画面（T-10）で作るチーム・選手・相手・試合・セットの読み書き。画面はこの TeamData だけを使う。
// 記録画面が試合を開くための loadMatch・addOpponentPlayer・createNextSet もここに置く。
// 記録画面から使うには contracts に約束を足す（PR の本文の案）。
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GameSet,
  Match,
  Opponent,
  OpponentPlayer,
  Player,
  Team,
} from '../../contracts/index.ts'
import { getSupabase } from './supabaseClient.ts'
import {
  COLUMNS,
  checkMatch,
  checkOpponentPlayerNumber,
  checkPlayer,
  matchFromRow,
  matchToRow,
  nextSetNo,
  opponentFromRow,
  opponentPlayerFromRow,
  playerFromRow,
  playerToRow,
  setFromRow,
  sortPlayers,
  toDataErrorMessage,
  type MatchInput,
  type MatchRow,
  type OpponentPlayerRow,
  type OpponentRow,
  type PlayerInput,
  type PlayerRow,
  type SetRow,
} from './teamRows.ts'

/** 記録画面が試合を開くときに要るもの */
export interface MatchContext {
  match: Match
  /** 練習は null */
  opponent: Opponent | null
  /** セットの番号の順 */
  sets: GameSet[]
  /** 背番号の順。引退した選手も含む（過去の記録の表示に使う） */
  players: Player[]
  /** 背番号の順 */
  opponentPlayers: OpponentPlayer[]
}

export interface TeamData {
  /** 自分が入っているチーム。まだなければ null */
  myTeam(): Promise<Team | null>
  /** チームを作り、作った人を管理者にする */
  createTeam(name: string): Promise<Team>
  listPlayers(teamId: string): Promise<Player[]>
  /** id があれば直し、なければ作る */
  savePlayer(teamId: string, input: PlayerInput): Promise<Player>
  listOpponents(teamId: string): Promise<Opponent[]>
  createOpponent(teamId: string, name: string): Promise<Opponent>
  listOpponentPlayers(opponentId: string): Promise<OpponentPlayer[]>
  /** 同じ背番号がすでにあれば、それを返す（試合中にその場で足す。F-04） */
  addOpponentPlayer(opponentId: string, number: number): Promise<OpponentPlayer>
  /** 日付の新しい順 */
  listMatches(teamId: string): Promise<Match[]>
  /** 試合を作り、第1セットも作る */
  createMatch(teamId: string, input: MatchInput): Promise<{ match: Match; firstSet: GameSet }>
  listSets(matchId: string): Promise<GameSet[]>
  /** 次のセットを作る（F-05）。上限（5セット）なら reject する */
  createNextSet(matchId: string): Promise<GameSet>
  loadMatch(matchId: string): Promise<MatchContext>
}

type Result<T> = { data: T | null; error: { message: string; code?: string } | null }

/** Supabase は失敗しても reject せず error を返すので、日本語のエラーにして reject する */
function check<T>(res: Result<T>): T {
  if (res.error) throw new Error(toDataErrorMessage(res.error))
  if (res.data === null) throw new Error('データが見つかりませんでした。')
  return res.data
}

function fail(message: string | null): void {
  if (message) throw new Error(message)
}

/** getClient は最初に使うときに呼ぶ */
export function createSupabaseTeamData(getClient: () => SupabaseClient): TeamData {
  const db = () => getClient()

  const listSets = async (matchId: string) =>
    check(
      await db()
        .from('sets')
        .select(COLUMNS.sets)
        .eq('match_id', matchId)
        .order('set_no')
        .returns<SetRow[]>(),
    ).map(setFromRow)

  const insertSet = async (matchId: string, setNo: number) =>
    setFromRow(
      check(
        await db()
          .from('sets')
          .insert({ match_id: matchId, set_no: setNo })
          .select(COLUMNS.sets)
          .single<SetRow>(),
      ),
    )

  const listOpponentPlayers = async (opponentId: string) =>
    check(
      await db()
        .from('opponent_players')
        .select(COLUMNS.opponent_players)
        .eq('opponent_id', opponentId)
        .order('number')
        .returns<OpponentPlayerRow[]>(),
    ).map(opponentPlayerFromRow)

  const listPlayers = async (teamId: string) =>
    sortPlayers(
      check(
        await db()
          .from('players')
          .select(COLUMNS.players)
          .eq('team_id', teamId)
          .returns<PlayerRow[]>(),
      ).map(playerFromRow),
    )

  return {
    async myTeam() {
      // RLS で、自分が入っているチームだけが返る。複数あれば最初に作ったもの
      const rows = check(
        await db()
          .from('teams')
          .select('id,name')
          .order('created_at')
          .limit(1)
          .returns<Team[]>(),
      )
      return rows[0] ?? null
    },
    async createTeam(name) {
      const teamName = name.trim()
      fail(teamName === '' || teamName.length > 100 ? 'チーム名は 1〜100 文字で入れてください。' : null)
      const id: unknown = check(await db().rpc('create_team', { team_name: teamName }))
      if (typeof id !== 'string') throw new Error('チームを作れませんでした。')
      return { id, name: teamName }
    },
    listPlayers,
    async savePlayer(teamId, input) {
      fail(checkPlayer(input))
      const row = playerToRow(teamId, input)
      const res = input.id
        ? await db().from('players').update(row).eq('id', input.id).select(COLUMNS.players).single<PlayerRow>()
        : await db().from('players').insert(row).select(COLUMNS.players).single<PlayerRow>()
      return playerFromRow(check(res))
    },
    async listOpponents(teamId) {
      return check(
        await db()
          .from('opponents')
          .select(COLUMNS.opponents)
          .eq('team_id', teamId)
          .order('name')
          .returns<OpponentRow[]>(),
      ).map(opponentFromRow)
    },
    async createOpponent(teamId, name) {
      const opponentName = name.trim()
      fail(opponentName === '' || opponentName.length > 100 ? 'チーム名は 1〜100 文字で入れてください。' : null)
      return opponentFromRow(
        check(
          await db()
            .from('opponents')
            .insert({ team_id: teamId, name: opponentName })
            .select(COLUMNS.opponents)
            .single<OpponentRow>(),
        ),
      )
    },
    listOpponentPlayers,
    async addOpponentPlayer(opponentId, number) {
      fail(checkOpponentPlayerNumber(number))
      // (opponent_id, number) は一意なので、すでにあれば同じ行が返る
      return opponentPlayerFromRow(
        check(
          await db()
            .from('opponent_players')
            .upsert({ opponent_id: opponentId, number }, { onConflict: 'opponent_id,number' })
            .select(COLUMNS.opponent_players)
            .single<OpponentPlayerRow>(),
        ),
      )
    },
    async listMatches(teamId) {
      return check(
        await db()
          .from('matches')
          .select(COLUMNS.matches)
          .eq('team_id', teamId)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .returns<MatchRow[]>(),
      ).map(matchFromRow)
    },
    async createMatch(teamId, input) {
      fail(checkMatch(input))
      const match = matchFromRow(
        check(
          await db()
            .from('matches')
            .insert(matchToRow(teamId, input))
            .select(COLUMNS.matches)
            .single<MatchRow>(),
        ),
      )
      // 第1セットを作れなくても、試合は残る。記録画面で開くときに createNextSet で作り直せる
      return { match, firstSet: await insertSet(match.id, 1) }
    },
    listSets,
    async createNextSet(matchId) {
      const setNo = nextSetNo(await listSets(matchId))
      fail(setNo === null ? 'これ以上セットを作れません（5セットまで）。' : null)
      return insertSet(matchId, setNo ?? 1)
    },
    async loadMatch(matchId) {
      const match = matchFromRow(
        check(
          await db()
            .from('matches')
            .select(COLUMNS.matches)
            .eq('id', matchId)
            .single<MatchRow>(),
        ),
      )
      const opponentId = match.opponentId
      const [opponent, sets, players, opponentPlayers] = await Promise.all([
        opponentId
          ? db()
              .from('opponents')
              .select(COLUMNS.opponents)
              .eq('id', opponentId)
              .single<OpponentRow>()
              .then((res) => opponentFromRow(check(res)))
          : Promise.resolve(null),
        listSets(matchId),
        listPlayers(match.teamId),
        opponentId ? listOpponentPlayers(opponentId) : Promise.resolve([]),
      ])
      return { match, opponent, sets, players, opponentPlayers }
    },
  }
}

/** アプリで使う TeamData */
export const teamData: TeamData = createSupabaseTeamData(getSupabase)
