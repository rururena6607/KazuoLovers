// 分析のタブに渡すデータ（選手・相手・試合・セット）を集める。記録は RecordRepository の購読で別に集める（AnalysisTab）。
import type { GameSet, Match, Opponent, OpponentPlayer, Player } from '../contracts/index.ts'
import {
  DEMO_MATCH,
  DEMO_OPPONENT,
  DEMO_PLAYERS,
  DEMO_PRACTICE,
  DEMO_PRACTICE_SET,
  DEMO_SETS,
} from '../features/record/demo.ts'
import type { TeamData } from '../lib/data/teamData.ts'

export interface TeamSnapshot {
  players: Player[]
  opponents: Opponent[]
  matches: Match[]
  gameSets: GameSet[]
  /**
   * 紅白戦の B チームの選手（playerId で部員と結ぶ。F-27）。B チームの成績を、その部員の成績に足すのに使う（T-50、#73）。
   * B チームは「相手チーム」の一覧（opponents）には出ないので、紅白戦の試合の opponentId から読む
   */
  opponentPlayers: OpponentPlayer[]
}

export type LoadTeam = () => Promise<TeamSnapshot | null>

/** 紅白戦の B チーム（相手チーム）の id。同じ id は 1 回だけ */
export const scrimmageTeamIds = (matches: readonly Match[]): string[] => [
  ...new Set(
    matches.flatMap((m) => (m.kind === 'scrimmage' && m.opponentId !== null ? [m.opponentId] : [])),
  ),
]

/** 本物：自分のチームの選手・相手・試合と、各試合のセット、紅白戦の B チームの選手。チームがまだなければ null */
export const loadTeamFrom =
  (
    data: Pick<
      TeamData,
      'myTeam' | 'listPlayers' | 'listOpponents' | 'listMatches' | 'listSets' | 'listOpponentPlayers'
    >,
  ): LoadTeam =>
  async () => {
    const team = await data.myTeam()
    if (!team) return null
    const [players, opponents, matches] = await Promise.all([
      data.listPlayers(team.id),
      data.listOpponents(team.id),
      data.listMatches(team.id),
    ])
    const [gameSets, opponentPlayers] = await Promise.all([
      Promise.all(matches.map((m) => data.listSets(m.id))).then((s) => s.flat()),
      Promise.all(scrimmageTeamIds(matches).map((id) => data.listOpponentPlayers(id))).then((p) =>
        p.flat(),
      ),
    ])
    return { players, opponents, matches, gameSets, opponentPlayers }
  }

/** デモ：記録のないセットは分析に出ても空なので、5セット分をそのまま渡す。デモに紅白戦はない */
export const loadDemoTeam: LoadTeam = () =>
  Promise.resolve({
    players: [...DEMO_PLAYERS],
    opponents: [DEMO_OPPONENT],
    matches: [DEMO_MATCH, DEMO_PRACTICE],
    gameSets: [...DEMO_SETS, DEMO_PRACTICE_SET],
    opponentPlayers: [],
  })
