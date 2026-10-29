// 管理画面（T-10、ひろし）ができるまで、記録画面で使う仮の試合・選手。
// T-10 ができたら、選んだ試合の Match・Player などに差し替える。
import type { GameSet, Match, Opponent, OpponentPlayer, Player } from '../../contracts/index.ts'

const TEAM = 'demo-team'

export const DEMO_PLAYERS: readonly Player[] = [
  { id: 'p1', teamId: TEAM, number: 1, name: '佐藤', position: 'S', serveType: 'float', active: true },
  { id: 'p3', teamId: TEAM, number: 3, name: '鈴木', position: 'OH', serveType: 'jump_float', active: true },
  { id: 'p4', teamId: TEAM, number: 4, name: '高橋', position: 'MB', serveType: 'float', active: true },
  { id: 'p7', teamId: TEAM, number: 7, name: '渡辺', position: 'OH', serveType: 'jump', active: true },
  { id: 'p8', teamId: TEAM, number: 8, name: '伊藤', position: 'OP', serveType: 'jump_float', active: true },
  { id: 'p10', teamId: TEAM, number: 10, name: '山本', position: 'MB', serveType: 'float', active: true },
  { id: 'p12', teamId: TEAM, number: 12, name: '中村', position: 'L', serveType: 'float', active: true },
]

export const DEMO_OPPONENT: Opponent = { id: 'demo-opp', teamId: TEAM, name: '熊本工業' }

export const DEMO_OPP_PLAYERS: readonly OpponentPlayer[] = [1, 2, 3, 5, 6, 9, 11, 12].map((n) => ({
  id: `o${n}`,
  opponentId: DEMO_OPPONENT.id,
  number: n,
}))

export const DEMO_MATCH: Match = {
  id: 'demo-match',
  teamId: TEAM,
  kind: 'match',
  opponentId: DEMO_OPPONENT.id,
  date: '2026-10-29',
  tournament: null,
  setPoints: 25,
}

/** 5セット分を最初から用意しておく（得点は記録から数える） */
export const DEMO_SETS: readonly GameSet[] = [1, 2, 3, 4, 5].map((setNo) => ({
  id: `demo-set-${setNo}`,
  matchId: DEMO_MATCH.id,
  setNo,
  ourScore: 0,
  oppScore: 0,
}))
