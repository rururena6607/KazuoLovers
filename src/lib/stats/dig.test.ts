import { describe, expect, it } from 'vitest'
import type { OppAttackRecord, OppAttackResult } from '../../contracts/index.ts'
import { zoneOf } from '../court/index.ts'
import { digLandingShare, digOriginShare, digStatsOf } from './dig.ts'

const opp = (result: OppAttackResult, o: Partial<OppAttackRecord> = {}): OppAttackRecord => ({
  kind: 'opp_attack',
  clientId: 'c',
  setId: 's1',
  hitterId: null,
  diggerId: null,
  fromX: null,
  fromY: null,
  toX: null,
  toY: null,
  speed: null,
  result,
  recordedAt: '2026-11-05T00:00:00Z',
  ...o,
})

const many = (result: OppAttackResult, n: number): OppAttackRecord[] =>
  Array.from({ length: n }, () => opp(result))

describe('digStatsOf（拾えた率。要件定義書 5 章の計算例）', () => {
  // 10 本：A3・B2・C1・D0・拾えず3・相手ミス1 → （3＋2＋1＋0）÷（6＋3）× 100 ≒ 66.7%
  const records = [
    ...many('A', 3),
    ...many('B', 2),
    ...many('C', 1),
    ...many('killed', 3),
    ...many('opp_error', 1),
  ]

  it('拾えた＝A〜D、分母＝拾えた＋拾えず（相手ミスは入れない）', () => {
    const s = digStatsOf(records)
    expect(s).toMatchObject({ total: 10, dug: 6, killed: 3, oppError: 1 })
    expect(s.digRate).toBeCloseTo(66.67, 1)
  })

  it('A〜D のどれでも拾えたに数える（評価の良し悪しは率に入れない）', () => {
    expect(digStatsOf(many('D', 4)).digRate).toBe(100)
    expect(digStatsOf([...many('A', 1), ...many('killed', 1)]).digRate).toBe(50)
    expect(digStatsOf([...many('D', 1), ...many('killed', 1)]).digRate).toBe(50)
  })

  it('相手ミスだけ・記録なしは null（分母 0）', () => {
    expect(digStatsOf(many('opp_error', 3))).toMatchObject({ total: 3, dug: 0, killed: 0, digRate: null })
    expect(digStatsOf([]).digRate).toBeNull()
  })

  it('全部拾えずなら 0%', () => {
    expect(digStatsOf(many('killed', 2)).digRate).toBe(0)
  })
})

describe('digLandingShare（落ちた位置。自コート）', () => {
  // 自コートのゾーン：奥の列 5・6・1、ネット側 4・3・2。y は 0.0＝ネット側、1.0＝エンドライン
  const records = [
    opp('A', { toX: 0.1, toY: 0.9 }), // 左奥 → 5
    opp('B', { toX: 0.1, toY: 0.9 }), // → 5
    opp('killed', { toX: 0.5, toY: 0.9 }), // 中奥 → 6
    opp('C', { toX: 0.9, toY: 0.1 }), // 右ネット側 → 2
    opp('killed'), // 位置なし（分母に入れない）
  ]

  it('分母は落ちた位置を記録した本数（4 本）', () => {
    const share = digLandingShare(records, zoneOf)
    expect(share.total).toBe(4)
    expect(share.zones.get(5)).toEqual({ count: 2, share: 50 })
    expect(share.zones.get(6)).toEqual({ count: 1, share: 25 })
    expect(share.zones.get(2)).toEqual({ count: 1, share: 25 })
    expect(share.zones.get(1)).toEqual({ count: 0, share: 0 })
  })

  it('位置を 1 本も入れていなければ、分母 0 で割合は null', () => {
    const share = digLandingShare([opp('A')], zoneOf)
    expect(share.total).toBe(0)
    expect(share.zones.get(1)?.share).toBeNull()
  })
})

describe('digOriginShare（打ってくる位置。相手コート）', () => {
  // 相手コートのゾーン：ネット側 2・3・4（左から）、奥 1・6・5
  const records = [
    opp('A', { fromX: 0.1, fromY: 0.1 }), // 左ネット側 → 2
    opp('B', { fromX: 0.1, fromY: 0.1 }), // → 2
    opp('killed', { fromX: 0.9, fromY: 0.1 }), // 右ネット側 → 4
    opp('A', { fromX: 0.5, fromY: 0.9, toX: 0.5, toY: 0.5 }), // 中奥 → 6（落ちた位置は別）
  ]

  it('打った位置のある本数が分母。落ちた位置は見ない', () => {
    const share = digOriginShare(records, zoneOf)
    expect(share.total).toBe(4)
    expect(share.zones.get(2)).toEqual({ count: 2, share: 50 })
    expect(share.zones.get(4)).toEqual({ count: 1, share: 25 })
    expect(share.zones.get(6)).toEqual({ count: 1, share: 25 })
  })
})
