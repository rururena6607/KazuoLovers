// 記録画面が試合を開くための MatchRepository（contracts、#36）のデモ版と、MatchContext を手元で直す関数。
// 本物は lib/data の teamData（ひろし、T-10）。キーがない手元ではデモ（下の createDemoMatchSource）を使う。
import type { GameSet, MatchRepository, OpponentPlayer } from '../../contracts/index.ts'
import { checkColSplits, duplicateNumberMessage } from '../../lib/data/teamRows.ts'
import {
  DEMO_MATCH,
  DEMO_OPPONENT,
  DEMO_OPP_PLAYERS,
  DEMO_PLAYERS,
  DEMO_PRACTICE,
  DEMO_PRACTICE_SET,
  DEMO_SETS,
} from './demo.ts'

/** 足した背番号を、背番号の順に入れる（同じ選手なら入れない） */
export const withOppPlayer = (list: readonly OpponentPlayer[], p: OpponentPlayer): OpponentPlayer[] =>
  list.some((o) => o.id === p.id) ? [...list] : [...list, p].sort((a, b) => a.number - b.number)

/** 作ったセットを、セットの番号の順に入れる（同じセットなら入れない） */
export const withSet = (sets: readonly GameSet[], s: GameSet): GameSet[] =>
  sets.some((x) => x.id === s.id) ? [...sets] : [...sets, s].sort((a, b) => a.setNo - b.setNo)

/** 保存し直したセット（列の境目など。F-24）で、同じ id のセットを置き換える */
export const withSavedSet = (sets: readonly GameSet[], s: GameSet): GameSet[] =>
  sets.map((x) => (x.id === s.id ? s : x))

/** 相手の背番号として受け付けるか（0〜99 の整数）。受け付けなければ null */
export const parseOppNumber = (text: string): number | null => {
  const t = text.trim()
  return /^\d{1,2}$/.test(t) ? Number(t) : null
}

/**
 * デモの試合と練習。セットは本物と同じく、第1セットから1つずつ増える。
 * フェイクの RecordRepository には5セット分の id を先に渡しておく（app/backend.ts）
 */
export function createDemoMatchSource(): MatchRepository {
  let setCount = 1
  let oppPlayers: OpponentPlayer[] = [...DEMO_OPP_PLAYERS]
  /** 動かした列の境目を、セットごとに残す（デモは画面を開いているあいだだけ） */
  const splitSets = new Map<string, GameSet>()

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
        sets: DEMO_SETS.slice(0, setCount).map((s) => splitSets.get(s.id) ?? s),
        players,
        opponentPlayers: [...oppPlayers],
      })
    },
    addOpponentPlayer: (opponentId, number, playerId) => {
      const sameTeam = oppPlayers.filter((o) => o.opponentId === opponentId)
      if (playerId !== undefined) {
        // 紅白戦：本物（teamData）と同じ。同じ部員なら、それを返す。別の部員と背番号が重なるなら reject する
        const linked = sameTeam.find((o) => o.playerId === playerId)
        if (linked) return Promise.resolve(linked)
        if (sameTeam.some((o) => o.number === number)) {
          return Promise.reject(new Error(duplicateNumberMessage(number)))
        }
      }
      const found = sameTeam.find((o) => o.number === number)
      if (found) return Promise.resolve(found)
      const added: OpponentPlayer = {
        id: `o${number}`,
        opponentId,
        number,
        ...(playerId !== undefined ? { playerId } : {}),
      }
      oppPlayers = [...oppPlayers, added].sort((a, b) => a.number - b.number)
      return Promise.resolve(added)
    },
    createNextSet: () => {
      const next = DEMO_SETS[setCount]
      if (!next) return Promise.reject(new Error('これ以上セットを作れません（5セットまで）。'))
      setCount += 1
      return Promise.resolve(next)
    },
    updateColSplits: (setId, colSplit1, colSplit2) => {
      const base = DEMO_SETS.find((s) => s.id === setId)
      if (!base) return Promise.reject(new Error('セットが見つかりませんでした。'))
      const invalid = checkColSplits(colSplit1, colSplit2)
      if (invalid) return Promise.reject(new Error(invalid))
      const updated: GameSet = { ...base, colSplit1, colSplit2 }
      splitSets.set(setId, updated)
      return Promise.resolve(updated)
    },
  }
}
