import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  Player,
  ReceptionRecord,
  ServeRecord,
  SetRecords,
} from '../../contracts/index.ts'
import { buildAiSummary, type AiSetInput } from './aiSummary.ts'

const player = (id: string, number: number, name: string): Player => ({
  id,
  teamId: 't',
  number,
  name,
  position: 'WS',
  serveType: 'float',
  active: true,
})
const players = [player('p7', 7, '渡辺太郎'), player('p3', 3, '佐藤花子'), player('p13', 3, '田中次郎')]

const serve = (o: Partial<ServeRecord> = {}): ServeRecord => ({
  kind: 'serve',
  clientId: 'c',
  setId: 's1',
  serverId: 'p7',
  serveType: 'float',
  fromX: 0.5,
  toX: 0.1,
  toY: 0.1,
  result: 'in',
  missType: null,
  reception: 'A',
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-10-20T00:00:00Z',
  ...o,
})
const reception = (o: Partial<ReceptionRecord> = {}): ReceptionRecord => ({
  kind: 'reception',
  clientId: 'c',
  setId: 's1',
  receiverId: 'p7',
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result: 'A',
  recordedAt: '2026-10-20T00:00:00Z',
  ...o,
})
const attack = (o: Partial<AttackRecord> = {}): AttackRecord => ({
  kind: 'attack',
  clientId: 'c',
  setId: 's1',
  attackerId: 'p7',
  attackType: null,
  isBack: false,
  toX: null,
  toY: null,
  result: 'kill',
  prevReception: null,
  recordedAt: '2026-10-20T00:00:00Z',
  ...o,
})
const records = (setId: string, o: Partial<SetRecords>): SetRecords => ({
  setId,
  serves: [],
  receptions: [],
  attacks: [],
  points: [],
  ...o,
})

const sets: AiSetInput[] = [
  {
    setNo: 2,
    ourScore: 20,
    oppScore: 25,
    records: records('s2', { serves: [serve({ result: 'miss', reception: null, missType: 'net', toX: null, toY: null })] }),
  },
  {
    setNo: 1,
    ourScore: 25,
    oppScore: 22,
    records: records('s1', {
      // p7（2セット目のミスと合わせて4本）：エース1・効果(C)1・A1・ミス1 →（100 + 25 − 25）÷ 4 = 25%、着弾はゾーン 2
      serves: [
        serve({ result: 'ace', reception: null }),
        serve({ reception: 'C', serveType: 'jump' }),
        serve({ reception: 'A' }),
        // 背番号 3（p3 と p13 は同じ背番号）：ミス1
        serve({ serverId: 'p3', result: 'miss', reception: null, missType: 'out', toX: 0.5, toY: 1.1 }),
        serve({ serverId: 'p13', reception: 'D', toX: 0.9, toY: 0.9 }),
      ],
      receptions: [
        reception({ result: 'A', atX: 0.1, atY: 0.1, oppServeType: 'jump' }),
        reception({ result: 'C', receiverId: 'p3' }),
        reception({ result: 'opp_miss', receiverId: null }),
      ],
      attacks: [attack({ prevReception: 'A', attackType: 'left' }), attack({ result: 'blocked', attackerId: 'p3' })],
    }),
  },
]

describe('buildAiSummary', () => {
  const summary = buildAiSummary({ players, sets })

  it('セットは番号順に、得点と指標を本数つきで並べる', () => {
    expect(summary.sets.map((s) => [s.setNo, s.ourScore, s.oppScore])).toEqual([
      [1, 25, 22],
      [2, 20, 25],
    ])
    expect(summary.sets[0]?.serve).toEqual({
      attempts: 5,
      // エース1・効果(C・D)2・ミス1 →（100 + 50 − 25）÷ 5 = 25%
      efficiency: 25,
      aceRate: 20,
      missRate: 20,
      reference: true,
    })
    expect(summary.minSample).toBe(10)
  })

  it('サーブ：選手別は背番号で、同じ背番号の選手は合算する（名簿にない選手は入れない）', () => {
    expect(summary.serve.byPlayer.map((p) => p.number)).toEqual([3, 7])
    const p7 = summary.serve.byPlayer.find((p) => p.number === 7)
    expect(p7).toMatchObject({ attempts: 4, efficiency: 25, reference: true })
    const p3 = summary.serve.byPlayer.find((p) => p.number === 3)
    expect(p3).toMatchObject({ attempts: 2, missRate: 50 })

    const unknown = buildAiSummary({ players: [], sets })
    expect(unknown.serve.byPlayer).toEqual([])
    expect(unknown.serve.total.attempts).toBe(6)
  })

  it('サーブ：種類別と、着弾ゾーン別の本数と C・D 率（本数のあるゾーンだけ）', () => {
    expect(summary.serve.byType.map((t) => [t.type, t.attempts])).toEqual([
      ['float', 5],
      ['jump', 1],
    ])
    // ゾーン 2：エース・C・A の3本 → C・D 率 1 ÷ 3 = 33.3%、ゾーン 5：D の1本 → 100%
    expect(summary.serve.byLandingZone).toEqual([
      { zone: 2, attempts: 3, cdRate: 33.3, reference: true },
      { zone: 5, attempts: 1, cdRate: 100, reference: true },
    ])
  })

  it('レシーブ：受数・成功率・被エース率、位置別、相手のサーブの種類別', () => {
    expect(summary.reception.total).toEqual({
      receptions: 2,
      successRate: 50,
      acedRate: 0,
      reference: true,
    })
    expect(summary.reception.byPlayer.map((p) => p.number)).toEqual([3, 7])
    expect(summary.reception.byZone.map((z) => z.zone)).toEqual([4])
    expect(summary.reception.byOppServeType.map((t) => t.type)).toEqual(['jump'])
  })

  it('アタック：打数・決定率・効果率・失点、種類別、前のレシーブの評価別', () => {
    expect(summary.attack.total).toEqual({
      attempts: 2,
      killRate: 50,
      efficiency: 0,
      errors: 1,
      reference: true,
    })
    expect(summary.attack.byType.map((t) => t.type)).toEqual(['left'])
    expect(summary.attack.byPrevReception.map((t) => t.grade)).toEqual(['A'])
  })

  it('10 本以上の項目は reference が false', () => {
    const many = buildAiSummary({
      players,
      sets: [{ setNo: 1, ourScore: 0, oppScore: 0, records: records('s1', { serves: Array.from({ length: 10 }, () => serve()) }) }],
    })
    expect(many.serve.total.reference).toBe(false)
    expect(many.serve.byPlayer[0]?.reference).toBe(false)
  })

  it('記録がなければ本数 0・率は null', () => {
    const none = buildAiSummary({ players, sets: [] })
    expect(none.sets).toEqual([])
    expect(none.serve.total).toEqual({ attempts: 0, efficiency: null, aceRate: null, missRate: null, reference: true })
    expect(none.serve.byLandingZone).toEqual([])
  })
})

describe('個人情報', () => {
  it('JSON に選手の名前・ポジション・id が入らない（背番号と数値だけ）', () => {
    const json = JSON.stringify(buildAiSummary({ players, sets }))
    for (const p of players) {
      expect(json).not.toContain(p.name)
      expect(json).not.toContain(p.id)
    }
    expect(json).not.toContain('WS')
    expect(json).not.toContain('2026-10-20')
  })
})
