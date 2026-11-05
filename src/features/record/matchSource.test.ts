import { describe, expect, it } from 'vitest'
import type { GameSet, OpponentPlayer } from '../../contracts/index.ts'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_PRACTICE } from './demo.ts'
import { duplicateNumberMessage } from '../../lib/data/teamRows.ts'
import {
  createDemoMatchSource,
  parseOppNumber,
  withOppPlayer,
  withSavedSet,
  withSet,
} from './matchSource.ts'

const opp = (n: number): OpponentPlayer => ({ id: `o${n}`, opponentId: 'x', number: n })
const set = (n: number): GameSet => ({ id: `s${n}`, matchId: 'm', setNo: n, ourScore: 0, oppScore: 0 })

describe('parseOppNumber', () => {
  it('0〜99 の整数だけ受け付ける', () => {
    expect(parseOppNumber('7')).toBe(7)
    expect(parseOppNumber(' 12 ')).toBe(12)
    expect(parseOppNumber('0')).toBe(0)
    expect(parseOppNumber('')).toBeNull()
    expect(parseOppNumber('100')).toBeNull()
    expect(parseOppNumber('-1')).toBeNull()
    expect(parseOppNumber('1.5')).toBeNull()
    expect(parseOppNumber('a')).toBeNull()
  })
})

describe('withOppPlayer・withSet', () => {
  it('背番号の順に入れ、同じ選手は2回入れない', () => {
    expect(withOppPlayer([opp(1), opp(9)], opp(5)).map((o) => o.number)).toEqual([1, 5, 9])
    expect(withOppPlayer([opp(1)], opp(1))).toHaveLength(1)
  })
  it('セットの番号の順に入れ、同じセットは2回入れない', () => {
    expect(withSet([set(1)], set(2)).map((s) => s.setNo)).toEqual([1, 2])
    expect(withSet([set(1), set(2)], set(2))).toHaveLength(2)
  })
})

describe('createDemoMatchSource', () => {
  it('第1セットだけで始まり、次のセットを作るたびに1つ増える。5セットで止まる', async () => {
    const src = createDemoMatchSource()
    expect((await src.loadMatch(DEMO_MATCH.id)).sets.map((s) => s.setNo)).toEqual([1])
    for (const n of [2, 3, 4, 5]) expect((await src.createNextSet(DEMO_MATCH.id)).setNo).toBe(n)
    expect((await src.loadMatch(DEMO_MATCH.id)).sets).toHaveLength(5)
    await expect(src.createNextSet(DEMO_MATCH.id)).rejects.toThrow()
  })
  it('相手の背番号を足すと次に読んだときに入っている。同じ背番号はそれを返す', async () => {
    const src = createDemoMatchSource()
    const added = await src.addOpponentPlayer(DEMO_OPPONENT.id, 99)
    expect((await src.loadMatch(DEMO_MATCH.id)).opponentPlayers).toContainEqual(added)
    expect(await src.addOpponentPlayer(DEMO_OPPONENT.id, 99)).toEqual(added)
  })
  it('練習は相手なし・1セット。知らない試合は reject', async () => {
    const src = createDemoMatchSource()
    const p = await src.loadMatch(DEMO_PRACTICE.id)
    expect(p.match.kind).toBe('practice')
    expect(p.opponent).toBeNull()
    expect(p.sets).toHaveLength(1)
    await expect(src.loadMatch('nope')).rejects.toThrow()
  })
})

describe('createDemoMatchSource の列の境目と紅白戦', () => {
  it('動かした列の境目を保存し、開き直しても残る。正しくない境目は断る', async () => {
    const src = createDemoMatchSource()
    const first = (await src.loadMatch(DEMO_MATCH.id)).sets[0]!
    const saved = await src.updateColSplits(first.id, 0.25, 0.6)
    expect(saved).toMatchObject({ id: first.id, colSplit1: 0.25, colSplit2: 0.6 })
    expect((await src.loadMatch(DEMO_MATCH.id)).sets[0]).toMatchObject({ colSplit1: 0.25, colSplit2: 0.6 })
    await expect(src.updateColSplits(first.id, 0.7, 0.3)).rejects.toThrow()
    await expect(src.updateColSplits('nothing', 0.3, 0.7)).rejects.toThrow()
  })

  it('部員（playerId）を渡すと、B チームの選手として足せる（紅白戦。デモでも形は同じ）', async () => {
    const src = createDemoMatchSource()
    const added = await src.addOpponentPlayer('o-b', 8, 'p8')
    expect(added).toMatchObject({ number: 8, playerId: 'p8' })
    // 渡さなければ、これまでどおり背番号だけ
    expect(await src.addOpponentPlayer('o-b', 33)).not.toHaveProperty('playerId')
  })

  it('本物（teamData）と同じ：同じ部員なら返す。別の部員と背番号が重なるなら reject する。B チームごとに分ける', async () => {
    const src = createDemoMatchSource()
    const first = await src.addOpponentPlayer('o-b', 8, 'p8')
    expect((await src.addOpponentPlayer('o-b', 8, 'p8')).id).toBe(first.id)
    await expect(src.addOpponentPlayer('o-b', 8, 'p9')).rejects.toThrow(duplicateNumberMessage(8))
    // 別の B チームなら、同じ背番号でも足せる
    expect(await src.addOpponentPlayer('o-b2', 8, 'p9')).toMatchObject({ opponentId: 'o-b2', number: 8, playerId: 'p9' })
  })
})

describe('withSavedSet', () => {
  it('同じ id のセットだけを、保存したセットに置き換える（F-24 の境目）', () => {
    const s1: GameSet = { id: 's1', matchId: 'm', setNo: 1, ourScore: 0, oppScore: 0 }
    const s2: GameSet = { id: 's2', matchId: 'm', setNo: 2, ourScore: 0, oppScore: 0 }
    const saved: GameSet = { ...s2, colSplit1: 0.25, colSplit2: 0.6 }
    expect(withSavedSet([s1, s2], saved)).toEqual([s1, saved])
  })
})
