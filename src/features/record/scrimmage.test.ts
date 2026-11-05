import { describe, expect, it } from 'vitest'
import type { OpponentPlayer } from '../../contracts/index.ts'
import { DEMO_MATCH, DEMO_PLAYERS } from './demo.ts'
import { isScrimmage, notInTeamB, oppLabelOf } from './scrimmage.ts'

const bPlayer = (playerId: string, number: number): OpponentPlayer => ({
  id: `b-${playerId}`,
  opponentId: 'o-b',
  number,
  playerId,
})

describe('isScrimmage', () => {
  it('種類が紅白戦のときだけ true', () => {
    expect(isScrimmage({ ...DEMO_MATCH, kind: 'scrimmage' })).toBe(true)
    expect(isScrimmage(DEMO_MATCH)).toBe(false)
  })
})

describe('oppLabelOf（F-27・6 章「選手は背番号と名前」）', () => {
  const label = oppLabelOf(DEMO_PLAYERS)
  it('B チームの部員は「背番号 名前」', () => {
    expect(label(bPlayer('p7', 7))).toBe('7 渡辺')
  })
  it('ふつうの相手選手・名簿にいない部員は背番号だけ', () => {
    expect(label({ id: 'o4', opponentId: 'o1', number: 4 })).toBe('4')
    expect(label({ id: 'o5', opponentId: 'o1', number: 5, playerId: null })).toBe('5')
    expect(label(bPlayer('gone', 99))).toBe('99')
  })
})

describe('notInTeamB', () => {
  it('B チームに入った部員を除く（A チームの選択肢・B に足せる部員）', () => {
    const rest = notInTeamB(DEMO_PLAYERS, [bPlayer('p7', 7), bPlayer('p8', 8)])
    expect(rest.map((p) => p.number)).toEqual([1, 3, 4, 10, 12])
  })
  it('ふつうの試合（playerId なし）では全員', () => {
    expect(notInTeamB(DEMO_PLAYERS, [{ id: 'o4', opponentId: 'o1', number: 4 }])).toHaveLength(
      DEMO_PLAYERS.length,
    )
  })
})
