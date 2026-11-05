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
  checkColSplits,
  checkMatch,
  checkOpponentPlayerNumber,
  checkPlayer,
  duplicateNumberMessage,
  matchFromRow,
  matchToRow,
  nextSetNo,
  opponentFromRow,
  opponentPlayerFromRow,
  playerFromRow,
  playerToRow,
  SCRIMMAGE_TEAM_NAME,
  setFromRow,
  sortPlayers,
  toDataErrorMessage,
  withoutScrimmageTeams,
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
  /** 相手チーム。紅白戦の B チーム（試合ごとに自動で作るもの）は含まない */
  listOpponents(teamId: string): Promise<Opponent[]>
  createOpponent(teamId: string, name: string): Promise<Opponent>
  listOpponentPlayers(opponentId: string): Promise<OpponentPlayer[]>
  /**
   * 同じ背番号がすでにあれば、それを返す（試合中にその場で足す。F-04）。
   * playerId（自チームの部員）を渡すと、紅白戦の B チームの選手として結ぶ（F-27）
   */
  addOpponentPlayer(opponentId: string, number: number, playerId?: string): Promise<OpponentPlayer>
  /** 日付の新しい順 */
  listMatches(teamId: string): Promise<Match[]>
  /**
   * 試合を作り、第1セットも作る。
   * 紅白戦（kind: 'scrimmage'）は、opponentId が null なら B チーム（「紅白戦（B チーム）」）を自動で作って付ける
   */
  createMatch(teamId: string, input: MatchInput): Promise<{ match: Match; firstSet: GameSet }>
  /**
   * 試合・練習・紅白戦を消す。セット・記録（サーブ・レシーブ・アタック・相手のスパイク・得点）もいっしょに消える。
   * 紅白戦は、ほかの試合が使っていなければ B チームも消す
   */
  deleteMatch(matchId: string): Promise<void>
  listSets(matchId: string): Promise<GameSet[]>
  /** 次のセットを作る（F-05）。上限（5セット）なら reject する */
  createNextSet(matchId: string): Promise<GameSet>
  /** セットの相手コートの列の境目を保存する（F-24）。0 ≤ 左 < 右 ≤ 1 */
  updateColSplits(setId: string, colSplit1: number, colSplit2: number): Promise<GameSet>
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
      const [rows, scrimmages] = await Promise.all([
        db()
          .from('opponents')
          .select(COLUMNS.opponents)
          .eq('team_id', teamId)
          .order('name')
          .returns<OpponentRow[]>(),
        db()
          .from('matches')
          .select('kind,opponent_id')
          .eq('team_id', teamId)
          .returns<{ kind: Match['kind']; opponent_id: string | null }[]>(),
      ])
      return withoutScrimmageTeams(check(rows).map(opponentFromRow), check(scrimmages))
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
    async addOpponentPlayer(opponentId, number, playerId) {
      fail(checkOpponentPlayerNumber(number))
      if (playerId === undefined) {
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
      }
      // 紅白戦：B チームに部員を入れる。すでに入っていれば、それを返す
      const found = check(
        await db()
          .from('opponent_players')
          .select(COLUMNS.opponent_players)
          .eq('opponent_id', opponentId)
          .eq('player_id', playerId)
          .returns<OpponentPlayerRow[]>(),
      )
      const existing = found[0]
      if (existing) return opponentPlayerFromRow(existing)
      const inserted = await db()
        .from('opponent_players')
        .insert({ opponent_id: opponentId, number, player_id: playerId })
        .select(COLUMNS.opponent_players)
        .single<OpponentPlayerRow>()
      if (inserted.error?.code === '23505') {
        // 一意制約に当たった。ほかの端末が同じ部員を同時に足したのなら、その行を返す。
        // そうでなければ、背番号が B チームの別の選手と重なっている
        const again = check(
          await db()
            .from('opponent_players')
            .select(COLUMNS.opponent_players)
            .eq('opponent_id', opponentId)
            .eq('player_id', playerId)
            .returns<OpponentPlayerRow[]>(),
        )
        const raced = again[0]
        if (raced) return opponentPlayerFromRow(raced)
        throw new Error(duplicateNumberMessage(number))
      }
      return opponentPlayerFromRow(check(inserted))
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
      // 紅白戦の B チームは、試合ごとに自動で作る（使い回すと、顔ぶれが変わったとき選手の対応がずれる）
      let createdTeamId: string | null = null
      let opponentId = input.opponentId
      if (input.kind === 'scrimmage' && opponentId === null) {
        const team = check(
          await db()
            .from('opponents')
            .insert({ team_id: teamId, name: SCRIMMAGE_TEAM_NAME })
            .select(COLUMNS.opponents)
            .single<OpponentRow>(),
        )
        createdTeamId = team.id
        opponentId = team.id
      }
      let match: Match
      try {
        match = matchFromRow(
          check(
            await db()
              .from('matches')
              .insert(matchToRow(teamId, { ...input, opponentId }))
              .select(COLUMNS.matches)
              .single<MatchRow>(),
          ),
        )
      } catch (e) {
        // 試合を作れなかったら、さっき作った B チームを残さない。消せなかったら、そのことも伝える
        if (createdTeamId) {
          const { error } = await db().from('opponents').delete().eq('id', createdTeamId)
          if (error) {
            throw new Error('試合を作れませんでした。作りかけの B チームも片づけられませんでした（一覧には出ません）。')
          }
        }
        throw e
      }
      // 第1セットを作れなくても、試合は残る。記録画面で開くときに createNextSet で作り直せる
      return { match, firstSet: await insertSet(match.id, 1) }
    },
    async deleteMatch(matchId) {
      const match = check(
        await db()
          .from('matches')
          .select('id,kind,opponent_id')
          .eq('id', matchId)
          .single<{ id: string; kind: Match['kind']; opponent_id: string | null }>(),
      )
      // 消せたかを確かめるため、消した行を返してもらう（権限がなければ 0 件になる）
      const deleted = check(
        await db().from('matches').delete().eq('id', matchId).select('id').returns<{ id: string }[]>(),
      )
      fail(deleted.length === 0 ? '削除できませんでした（試合が見つからないか、権限がありません）。' : null)
      if (match.kind !== 'scrimmage' || match.opponent_id === null) return
      // 紅白戦の B チームは、ほかの試合が使っていなければいっしょに消す（B チームの選手も消える）
      const rest = check(
        await db().from('matches').select('id').eq('opponent_id', match.opponent_id).returns<{ id: string }[]>(),
      )
      if (rest.length === 0) {
        // 既定の名前の相手だけ消す（ふつうの相手チームを、巻き込んで消さない）
        const { error } = await db()
          .from('opponents')
          .delete()
          .eq('id', match.opponent_id)
          .eq('name', SCRIMMAGE_TEAM_NAME)
        if (error) {
          throw new Error('試合は削除しました。B チームの片づけだけ失敗しました（一覧には出ません）。')
        }
      }
    },
    listSets,
    async createNextSet(matchId) {
      const setNo = nextSetNo(await listSets(matchId))
      fail(setNo === null ? 'これ以上セットを作れません（5セットまで）。' : null)
      return insertSet(matchId, setNo ?? 1)
    },
    async updateColSplits(setId, colSplit1, colSplit2) {
      fail(checkColSplits(colSplit1, colSplit2))
      return setFromRow(
        check(
          await db()
            .from('sets')
            .update({ col_split_1: colSplit1, col_split_2: colSplit2 })
            .eq('id', setId)
            .select(COLUMNS.sets)
            .single<SetRow>(),
        ),
      )
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
