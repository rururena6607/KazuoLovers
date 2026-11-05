// 分析のタブに渡すデータ（選手・相手・試合・セット）を集める。記録は RecordRepository の購読で別に集める（AnalysisTab）。
import type { GameSet, Match, Opponent, Player } from '../contracts/index.ts'
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
}

export type LoadTeam = () => Promise<TeamSnapshot | null>

/** 本物：自分のチームの選手・相手・試合と、各試合のセット。チームがまだなければ null */
export const loadTeamFrom =
  (data: TeamData): LoadTeam =>
  async () => {
    const team = await data.myTeam()
    if (!team) return null
    const [players, opponents, matches] = await Promise.all([
      data.listPlayers(team.id),
      data.listOpponents(team.id),
      data.listMatches(team.id),
    ])
    const gameSets = (await Promise.all(matches.map((m) => data.listSets(m.id)))).flat()
    return { players, opponents, matches, gameSets }
  }

/** デモ：記録のないセットは分析に出ても空なので、5セット分をそのまま渡す */
export const loadDemoTeam: LoadTeam = () =>
  Promise.resolve({
    players: [...DEMO_PLAYERS],
    opponents: [DEMO_OPPONENT],
    matches: [DEMO_MATCH, DEMO_PRACTICE],
    gameSets: [...DEMO_SETS, DEMO_PRACTICE_SET],
  })
