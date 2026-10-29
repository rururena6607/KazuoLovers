import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  AttackResult,
  Grade,
  ReceptionRecord,
  ReceptionResult,
  ServeRecord,
  ServeResult,
} from '../../contracts/index.ts'
import {
  attackStatsOf,
  breakRateOf,
  excellentRateOf,
  receptionStatsOf,
  serveStatsOf,
} from './metrics.ts'

const serve = (result: ServeResult, reception: Grade | null = null): ServeRecord => ({
  kind: 'serve',
  clientId: 'c',
  setId: 's1',
  serverId: 'p1',
  serveType: 'float',
  fromX: 0.5,
  toX: 0.5,
  toY: 0.5,
  result,
  missType: result === 'miss' ? 'net' : null,
  reception,
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-10-29T00:00:00Z',
})

const reception = (result: ReceptionResult): ReceptionRecord => ({
  kind: 'reception',
  clientId: 'c',
  setId: 's1',
  receiverId: result === 'opp_miss' ? null : 'p1',
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result,
  recordedAt: '2026-10-29T00:00:00Z',
})

const attack = (result: AttackResult): AttackRecord => ({
  kind: 'attack',
  clientId: 'c',
  setId: 's1',
  attackerId: 'p1',
  attackType: null,
  isBack: false,
  toX: null,
  toY: null,
  result,
  prevReception: null,
  recordedAt: '2026-10-29T00:00:00Z',
})

const repeat = <T>(n: number, make: () => T): T[] => Array.from({ length: n }, make)

describe('serveStatsOf（JVA 記録票）', () => {
  it('チーム：打数61、エース2、効果25、ミス4 → 11.9%', () => {
    const serves = [
      ...repeat(2, () => serve('ace')),
      ...repeat(15, () => serve('in', 'C')),
      ...repeat(10, () => serve('in', 'D')),
      ...repeat(4, () => serve('miss')),
      ...repeat(20, () => serve('in', 'A')),
      ...repeat(10, () => serve('in', 'B')),
    ]
    const stats = serveStatsOf(serves)
    expect(stats).toMatchObject({ attempts: 61, aces: 2, effects: 25, misses: 4 })
    expect(stats.efficiency).toBeCloseTo(11.9, 1)
  })

  it('マイナス：打数7、エース0、効果0、ミス2 → −7.1%', () => {
    const serves = [
      ...repeat(2, () => serve('miss')),
      ...repeat(5, () => serve('in', 'A')),
    ]
    expect(serveStatsOf(serves).efficiency).toBeCloseTo(-7.1, 1)
  })

  it('要件定義書の計算例：10本でエース1・効果3・ミス2 → 12.5%', () => {
    const serves = [
      serve('ace'),
      ...repeat(3, () => serve('in', 'C')),
      ...repeat(2, () => serve('miss')),
      ...repeat(4, () => serve('in', 'B')),
    ]
    const stats = serveStatsOf(serves)
    expect(stats.efficiency).toBe(12.5)
    expect(stats.aceRate).toBe(10)
    expect(stats.missRate).toBe(20)
  })

  it('受けた評価が未入力のインは効果に数えない', () => {
    const stats = serveStatsOf([serve('in', null)])
    expect(stats).toMatchObject({ attempts: 1, effects: 0 })
    expect(stats.efficiency).toBe(0)
  })

  it('打数0 → null', () => {
    expect(serveStatsOf([])).toEqual({
      attempts: 0,
      aces: 0,
      effects: 0,
      misses: 0,
      efficiency: null,
      aceRate: null,
      missRate: null,
    })
  })
})

describe('receptionStatsOf（JVA 記録票）', () => {
  it('受数64、A23、B11 → 44.5%', () => {
    const records = [
      ...repeat(23, () => reception('A')),
      ...repeat(11, () => reception('B')),
      ...repeat(20, () => reception('C')),
      ...repeat(6, () => reception('D')),
      ...repeat(4, () => reception('ace')),
    ]
    const stats = receptionStatsOf(records)
    expect(stats).toMatchObject({ receptions: 64, excellent: 23, good: 11, aced: 4 })
    expect(stats.successRate).toBeCloseTo(44.5, 1)
    expect(stats.acedRate).toBeCloseTo(6.25, 5)
  })

  it('要件定義書の計算例：10本受けてA5・B3 → 65%', () => {
    const records = [
      ...repeat(5, () => reception('A')),
      ...repeat(3, () => reception('B')),
      ...repeat(2, () => reception('C')),
    ]
    expect(receptionStatsOf(records).successRate).toBe(65)
  })

  it('相手ミスは受数に入れない', () => {
    const stats = receptionStatsOf([reception('opp_miss'), reception('A')])
    expect(stats.receptions).toBe(1)
    expect(stats.successRate).toBe(100)
  })

  it('受数0 → null', () => {
    const stats = receptionStatsOf([reception('opp_miss')])
    expect(stats.receptions).toBe(0)
    expect(stats.successRate).toBeNull()
    expect(stats.acedRate).toBeNull()
  })
})

describe('attackStatsOf（JVA 記録票）', () => {
  it('打数110、得点35 → 31.8%', () => {
    const attacks = [
      ...repeat(35, () => attack('kill')),
      ...repeat(40, () => attack('continue')),
      ...repeat(20, () => attack('error')),
      ...repeat(15, () => attack('blocked')),
    ]
    const stats = attackStatsOf(attacks)
    expect(stats).toMatchObject({ attempts: 110, kills: 35, errors: 35 })
    expect(stats.killRate).toBeCloseTo(31.8, 1)
    expect(stats.efficiency).toBe(0)
  })

  it('効果率 =（得点−失点）÷ 打数。失点はミス＋被ブロック', () => {
    const attacks = [attack('kill'), attack('error'), attack('blocked'), attack('continue')]
    expect(attackStatsOf(attacks).efficiency).toBe(-25)
  })

  it('打数0 → null', () => {
    const stats = attackStatsOf([])
    expect(stats.killRate).toBeNull()
    expect(stats.efficiency).toBeNull()
  })
})

describe('補助指標（要件定義書 5 章）', () => {
  it('崩し率 =（エース＋C＋D）÷ 打数', () => {
    const serves = [
      serve('ace'),
      serve('in', 'C'),
      serve('in', 'D'),
      serve('in', 'A'),
      serve('in', 'B'),
      serve('miss'),
      serve('in', 'A'),
      serve('in', 'B'),
    ]
    expect(breakRateOf(serves)).toBe(37.5)
    expect(breakRateOf([])).toBeNull()
  })

  it('A返球率 = A ÷ 受数。相手ミスは受数に入れない', () => {
    expect(excellentRateOf(['A', 'A', 'B', 'ace', 'opp_miss'])).toBe(50)
    expect(excellentRateOf(['opp_miss'])).toBeNull()
  })
})

describe('練習のサーブを混ぜたとき（前提の確認）', () => {
  it('評価がないインは打数に入るので、試合のサーブだけを渡す前提になる', () => {
    const match = [
      serve('ace'),
      ...repeat(3, () => serve('in', 'C')),
      ...repeat(2, () => serve('miss')),
      ...repeat(4, () => serve('in', 'B')),
    ]
    const withPractice = [...match, ...repeat(10, () => serve('in', null))]
    expect(serveStatsOf(match).efficiency).toBe(12.5)
    expect(serveStatsOf(withPractice).efficiency).toBe(6.25)
  })
})
