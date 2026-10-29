import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  ReceptionRecord,
  ServeRecord,
  SetRecords,
} from '../../contracts/index.ts'
import {
  attackStatsByPlayer,
  attackStatsByPrevReception,
  attackStatsByRow,
  attackStatsByType,
  opponentReceptionStatsByPlayer,
  practiceStatsByPlayer,
  practiceStatsByTargetZone,
  practiceStatsOf,
  receptionStatsByOppServeType,
  receptionStatsByPlayer,
  receptionStatsByZone,
  serveStatsByFromZone,
  serveStatsByLandingZone,
  serveStatsByPlayer,
  serveStatsByType,
  summaryByGroup,
  summaryBySet,
} from './aggregate.ts'

const serve = (o: Partial<ServeRecord> = {}): ServeRecord => ({
  kind: 'serve',
  clientId: 'c',
  setId: 's1',
  serverId: 'p1',
  serveType: 'float',
  fromX: 0.5,
  toX: 0.5,
  toY: 0.5,
  result: 'in',
  missType: null,
  reception: 'A',
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-10-29T00:00:00Z',
  ...o,
})

const reception = (o: Partial<ReceptionRecord> = {}): ReceptionRecord => ({
  kind: 'reception',
  clientId: 'c',
  setId: 's1',
  receiverId: 'p1',
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result: 'A',
  recordedAt: '2026-10-29T00:00:00Z',
  ...o,
})

const attack = (o: Partial<AttackRecord> = {}): AttackRecord => ({
  kind: 'attack',
  clientId: 'c',
  setId: 's1',
  attackerId: 'p1',
  attackType: null,
  isBack: false,
  toX: null,
  toY: null,
  result: 'kill',
  prevReception: null,
  recordedAt: '2026-10-29T00:00:00Z',
  ...o,
})

describe('サーブの集計', () => {
  // p1：エース1・効果1(C)・ミス1・A1 の4本 →（100 + 25 − 25）÷ 4 = 25%
  // p2：ミス1・B1 の2本 → −25 ÷ 2 = −12.5%
  const serves = [
    serve({ serverId: 'p1', result: 'ace', reception: null }),
    serve({ serverId: 'p1', reception: 'C' }),
    serve({ serverId: 'p1', result: 'miss', reception: null, missType: 'net' }),
    serve({ serverId: 'p1', reception: 'A' }),
    serve({ serverId: 'p2', result: 'miss', reception: null, missType: 'out' }),
    serve({ serverId: 'p2', reception: 'B' }),
  ]

  it('選手別', () => {
    const by = serveStatsByPlayer(serves)
    expect(by.get('p1')?.efficiency).toBe(25)
    expect(by.get('p1')?.attempts).toBe(4)
    expect(by.get('p2')?.efficiency).toBe(-12.5)
    expect([...by.keys()]).toEqual(['p1', 'p2'])
  })

  it('サーブの種類別', () => {
    const by = serveStatsByType([
      serve({ serveType: 'float', result: 'ace', reception: null }),
      serve({ serveType: 'jump', reception: 'D' }),
      serve({ serveType: 'jump', reception: 'A' }),
    ])
    expect(by.get('float')?.efficiency).toBe(100)
    expect(by.get('jump')?.efficiency).toBe(12.5)
    expect(by.has('other')).toBe(false)
  })

  it('打つ位置別：エンドライン上の位置を 5・6・1 に分ける。位置なしは入れない', () => {
    const by = serveStatsByFromZone([
      serve({ fromX: 0.1 }),
      serve({ fromX: 0.5 }),
      serve({ fromX: 0.55 }),
      serve({ fromX: 0.9, result: 'ace', reception: null }),
      serve({ fromX: null }),
    ])
    expect(by.get(5)?.attempts).toBe(1)
    expect(by.get(6)?.attempts).toBe(2)
    expect(by.get(1)?.efficiency).toBe(100)
    expect([...by.values()].reduce((n, s) => n + s.attempts, 0)).toBe(4)
  })

  it('着弾ゾーン別：6 ゾーンすべてを返し、アウトとネットは入れない', () => {
    const by = serveStatsByLandingZone([
      serve({ toX: 0.1, toY: 0.1, reception: 'C' }), // ゾーン 2
      serve({ toX: 0.15, toY: 0.2, reception: 'A' }), // ゾーン 2
      serve({ toX: 0.5, toY: 0.9, result: 'ace', reception: null }), // ゾーン 6
      serve({ toX: 0.5, toY: 1.1, result: 'miss', reception: null, missType: 'out' }), // アウト
      serve({ toX: null, toY: null, result: 'miss', reception: null, missType: 'net' }), // ネット
    ])
    expect([...by.keys()]).toEqual([1, 2, 3, 4, 5, 6])
    expect(by.get(2)).toMatchObject({ attempts: 2, effects: 1 })
    expect(by.get(2)?.efficiency).toBe(12.5)
    expect(by.get(6)?.efficiency).toBe(100)
    expect(by.get(1)?.attempts).toBe(0)
    expect(by.get(1)?.efficiency).toBeNull()
  })

  it('相手選手別のサーブレシーブ成功率：エースは被エース、ミスは入れない', () => {
    const by = opponentReceptionStatsByPlayer([
      serve({ receiverId: 'o5', reception: 'A' }),
      serve({ receiverId: 'o5', reception: 'B' }),
      serve({ receiverId: 'o5', result: 'ace', reception: null }),
      serve({ receiverId: 'o5', result: 'miss', reception: null, missType: 'net' }),
      serve({ receiverId: 'o8', reception: 'D' }),
      serve({ receiverId: 'o8', reception: null }),
      serve({ receiverId: null, reception: 'A' }),
    ])
    // o5：受数3、A1・B1・被エース1 →（100 + 50）÷ 3 = 50
    expect(by.get('o5')).toMatchObject({ receptions: 3, aced: 1 })
    expect(by.get('o5')?.successRate).toBe(50)
    expect(by.get('o8')?.receptions).toBe(1)
    expect(by.get('o8')?.successRate).toBe(0)
    expect(by.size).toBe(2)
  })
})

describe('レシーブの集計', () => {
  it('選手別：相手ミスは入れない', () => {
    const by = receptionStatsByPlayer([
      reception({ receiverId: 'p1', result: 'A' }),
      reception({ receiverId: 'p1', result: 'C' }),
      reception({ receiverId: 'p2', result: 'ace' }),
      reception({ receiverId: null, result: 'opp_miss' }),
    ])
    expect(by.get('p1')?.successRate).toBe(50)
    expect(by.get('p2')?.acedRate).toBe(100)
    expect(by.size).toBe(2)
  })

  it('相手のサーブの種類別：種類なしは入れない', () => {
    const by = receptionStatsByOppServeType([
      reception({ oppServeType: 'jump', result: 'D' }),
      reception({ oppServeType: 'jump', result: 'B' }),
      reception({ oppServeType: 'float', result: 'A' }),
      reception({ oppServeType: null, result: 'A' }),
    ])
    expect(by.get('jump')?.successRate).toBe(25)
    expect(by.get('float')?.successRate).toBe(100)
    expect(by.size).toBe(2)
  })

  it('受けた位置別（自コート）：ゾーン 4 は自コートの前衛の左', () => {
    const by = receptionStatsByZone([
      reception({ atX: 0.1, atY: 0.1, result: 'C' }), // 自コート ネット側の左 = 4
      reception({ atX: 0.9, atY: 0.9, result: 'A' }), // 奥の右 = 1
      reception({ atX: null, atY: null, result: 'A' }),
    ])
    expect(by.get(4)?.successRate).toBe(0)
    expect(by.get(1)?.successRate).toBe(100)
    expect(by.get(5)?.receptions).toBe(0)
  })
})

describe('アタックの集計', () => {
  const attacks = [
    attack({ attackerId: 'p1', result: 'kill', attackType: 'left', prevReception: 'A' }),
    attack({ attackerId: 'p1', result: 'continue', attackType: 'left', prevReception: 'A' }),
    attack({ attackerId: 'p1', result: 'blocked', attackType: 'center', prevReception: 'C' }),
    attack({ attackerId: 'p2', result: 'kill', isBack: true, attackType: 'back' }),
    attack({ attackerId: 'p2', result: 'error', isBack: true }),
  ]

  it('選手別', () => {
    const by = attackStatsByPlayer(attacks)
    expect(by.get('p1')?.killRate).toBeCloseTo(100 / 3, 10)
    expect(by.get('p1')?.efficiency).toBe(0)
    expect(by.get('p2')?.killRate).toBe(50)
  })

  it('攻撃の種類別：種類なしは入れない', () => {
    const by = attackStatsByType(attacks)
    expect(by.get('left')?.attempts).toBe(2)
    expect(by.get('center')?.efficiency).toBe(-100)
    expect(by.get('back')?.killRate).toBe(100)
    expect(by.size).toBe(3)
  })

  it('前のレシーブの評価別：切り返しは入れない', () => {
    const by = attackStatsByPrevReception(attacks)
    expect(by.get('A')?.killRate).toBe(50)
    expect(by.get('C')?.killRate).toBe(0)
    expect(by.size).toBe(2)
  })

  it('前衛とバックアタック', () => {
    const row = attackStatsByRow(attacks)
    expect(row.back).toMatchObject({ attempts: 2, kills: 1 })
    expect(row.back.killRate).toBe(50)
    expect(row.front.attempts).toBe(3)
  })
})

describe('練習の集計', () => {
  const serves = [
    serve({ targetZone: 1, toX: 0.9, toY: 0.9 }), // 着弾はゾーン 5（狙いは 1 で外れ）
    serve({ targetZone: 5, toX: 0.9, toY: 0.9 }), // ゾーン 5 に入った
    serve({ targetZone: 5, toX: 0.9, toY: 0.1 }), // 着弾はゾーン 4（狙いは 5 で外れ）
    serve({ targetZone: 5, result: 'miss', reception: null, missType: 'out', toX: 0.9, toY: 1.1 }),
    serve({ targetZone: null, toX: 0.5, toY: 0.5 }),
  ]

  it('成功率とゾーン的中率', () => {
    const stats = practiceStatsOf(serves)
    expect(stats).toMatchObject({ attempts: 5, successes: 4, targeted: 4, zoneHits: 1 })
    expect(stats.successRate).toBe(80)
    expect(stats.zoneHitRate).toBe(25)
  })

  it('選手別・狙ったゾーン別', () => {
    expect(practiceStatsByPlayer(serves).get('p1')?.attempts).toBe(5)
    const by = practiceStatsByTargetZone(serves)
    expect(by.get(5)).toMatchObject({ attempts: 3, zoneHits: 1 })
    expect(by.get(5)?.zoneHitRate).toBeCloseTo(100 / 3, 10)
    expect(by.get(1)?.zoneHitRate).toBe(0)
    expect(by.get(2)?.successRate).toBeNull()
  })

  it('本数0 → null', () => {
    const stats = practiceStatsOf([])
    expect(stats.successRate).toBeNull()
    expect(stats.zoneHitRate).toBeNull()
  })
})

describe('セット別・相手別の要約', () => {
  const set = (setId: string, o: Partial<SetRecords>): SetRecords => ({
    setId,
    serves: [],
    receptions: [],
    attacks: [],
    points: [],
    ...o,
  })
  const sets = [
    set('s1', {
      serves: [serve({ result: 'ace', reception: null }), serve({ reception: 'A' })],
      receptions: [reception({ result: 'A' })],
      attacks: [attack({ result: 'kill' })],
    }),
    set('s2', {
      serves: [serve({ result: 'miss', reception: null, missType: 'net' }), serve({ reception: 'C' })],
      receptions: [reception({ result: 'C' })],
      attacks: [attack({ result: 'error' })],
    }),
    set('s3', { serves: [serve({ reception: 'A' })] }),
  ]

  it('セット別', () => {
    const by = summaryBySet(sets)
    expect(by.get('s1')?.serve.efficiency).toBe(50)
    expect(by.get('s2')?.serve.efficiency).toBe(0)
    expect(by.get('s1')?.reception.successRate).toBe(100)
    expect(by.get('s2')?.attack.killRate).toBe(0)
    expect(by.get('s3')?.attack.killRate).toBeNull()
  })

  it('相手別：セットを相手ごとにまとめて、本数から出し直す', () => {
    const opponentOf: Record<string, string | null> = { s1: 'oppA', s2: 'oppA', s3: 'oppB' }
    const by = summaryByGroup(sets, (s) => opponentOf[s.setId] ?? null)
    // oppA：4本、エース1・効果1・ミス1 →（100 + 25 − 25）÷ 4 = 25
    expect(by.get('oppA')?.serve.efficiency).toBe(25)
    expect(by.get('oppA')?.serve.attempts).toBe(4)
    expect(by.get('oppA')?.reception.successRate).toBe(50)
    expect(by.get('oppB')?.serve.attempts).toBe(1)
  })

  it('キーが null のセットは入れない', () => {
    expect(summaryByGroup(sets, () => null).size).toBe(0)
  })
})
