// 記録画面が試合を開き、試合中に相手の背番号やセットを足すための入口。
// 形は #36 の contracts/MatchRepository と同じ。#36 がマージされたら、この型を contracts のものに替える。
// 本物は lib/data の teamData（ひろし、T-10）。キーがない手元ではデモ（下の createDemoMatchSource）を使う。
import type { GameSet, Match, Opponent, OpponentPlayer, Player } from '../../contracts/index.ts'
import {
  DEMO_MATCH,
  DEMO_OPPONENT,
  DEMO_OPP_PLAYERS,
  DEMO_PLAYERS,
  DEMO_PRACTICE,
  DEMO_PRACTICE_SET,
  DEMO_SETS,
} from './demo.ts'

/** 記録画面が試合を開くときに要るもの */
export interface MatchContext {
  match: Match
  /** 練習は null */
  opponent: Opponent | null
  /** セットの番号の順 */
  sets: GameSet[]
  /** 背番号の順。引退した選手も含む（過去の記録の表示に使う）。選ぶときは active の選手だけを出す */
  players: Player[]
  /** 背番号の順 */
  opponentPlayers: OpponentPlayer[]
}

export interface MatchSource {
  loadMatch(matchId: string): Promise<MatchContext>
  /** 同じ背番号がすでにあれば、それを返す（F-04） */
  addOpponentPlayer(opponentId: string, number: number): Promise<OpponentPlayer>
  /** 次のセットを作る（F-05）。5セットあれば reject する */
  createNextSet(matchId: string): Promise<GameSet>
}

/** 足した背番号を、背番号の順に入れる（同じ選手なら入れない） */
export const withOppPlayer = (list: readonly OpponentPlayer[], p: OpponentPlayer): OpponentPlayer[] =>
  list.some((o) => o.id === p.id) ? [...list] : [...list, p].sort((a, b) => a.number - b.number)

/** 作ったセットを、セットの番号の順に入れる（同じセットなら入れない） */
export const withSet = (sets: readonly GameSet[], s: GameSet): GameSet[] =>
  sets.some((x) => x.id === s.id) ? [...sets] : [...sets, s].sort((a, b) => a.setNo - b.setNo)

/** 相手の背番号として受け付けるか（0〜99 の整数）。受け付けなければ null */
export const parseOppNumber = (text: string): number | null => {
  const t = text.trim()
  return /^\d{1,2}$/.test(t) ? Number(t) : null
}

/**
 * デモの試合と練習。セットは本物と同じく、第1セットから1つずつ増える。
 * フェイクの RecordRepository には5セット分の id を先に渡しておく（App.tsx）
 */
export function createDemoMatchSource(): MatchSource {
  let setCount = 1
  let oppPlayers: OpponentPlayer[] = [...DEMO_OPP_PLAYERS]

  return {
    loadMatch: (matchId) => {
      const players = [...DEMO_PLAYERS]
      if (matchId === DEMO_PRACTICE.id) {
        return Promise.resolve({
          match: DEMO_PRACTICE,
          opponent: null,
          sets: [DEMO_PRACTICE_SET],
          players,
          opponentPlayers: [],
        })
      }
      if (matchId !== DEMO_MATCH.id) return Promise.reject(new Error('試合が見つかりませんでした。'))
      return Promise.resolve({
        match: DEMO_MATCH,
        opponent: DEMO_OPPONENT,
        sets: DEMO_SETS.slice(0, setCount),
        players,
        opponentPlayers: [...oppPlayers],
      })
    },
    addOpponentPlayer: (opponentId, number) => {
      const found = oppPlayers.find((o) => o.number === number)
      if (found) return Promise.resolve(found)
      const added: OpponentPlayer = { id: `o${number}`, opponentId, number }
      oppPlayers = [...oppPlayers, added].sort((a, b) => a.number - b.number)
      return Promise.resolve(added)
    },
    createNextSet: () => {
      const next = DEMO_SETS[setCount]
      if (!next) return Promise.reject(new Error('これ以上セットを作れません（5セットまで）。'))
      setCount += 1
      return Promise.resolve(next)
    },
  }
}
