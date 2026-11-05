import { describe, expect, it } from 'vitest'
import type { GameSet, OpponentPlayer } from '../../contracts/index.ts'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_PRACTICE } from './demo.ts'
import { createDemoMatchSource, parseOppNumber, withOppPlayer, withSet } from './matchSource.ts'

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

  it('デモの試合は紅白戦ではないので、B チームの選手は足せない', async () => {
    await expect(createDemoMatchSource().addScrimmagePlayer('o', 'p')).rejects.toThrow()
  })
})
