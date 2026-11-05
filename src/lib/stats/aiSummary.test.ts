import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  Player,
  ReceptionRecord,
  ServeRecord,
  SetRecords,
} from '../../contracts/index.ts'
import { zoneOf } from '../court/index.ts'
import { buildAiSummary as build, type AiSetInput, type AiSummaryInput } from './aiSummary.ts'

// ゾーンに分ける関数は引数で渡す（lib/stats は lib/court に依存しない）。テストでは本物の zoneOf を渡す
const buildAiSummary = (input: AiSummaryInput) => build(input, zoneOf)

const player = (id: string, number: number, name: string): Player => ({
  id,
  teamId: 't',
  number,
  name,
  position: 'WS',
  serveType: 'float',
  active: true,
})
// p13 は引退した選手で、背番号 3 を今の p3 が引き継いでいる
const players = [player('p7', 7, '渡辺太郎'), player('p3', 3, '佐藤花子'), { ...player('p13', 3, '田中次郎'), active: false }]

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
    matchNo: 1,
    setNo: 2,
    ourScore: 20,
    oppScore: 25,
    records: records('s2', { serves: [serve({ result: 'miss', reception: null, missType: 'net', toX: null, toY: null })] }),
  },
  {
    matchNo: 1,
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

  it('サーブ：選手別は背番号で出す。同じ背番号の別人は合算せず、引退した選手には retired が付く', () => {
    expect(summary.serve.byPlayer.map((p) => [p.number, p.retired, p.attempts])).toEqual([
      [3, false, 1], // 今の 3 番（p3）：ミス 1 本
      [3, true, 1], // 引退した 3 番（p13）：D 1 本
      [7, false, 4],
    ])
    expect(summary.serve.byPlayer[0]).toMatchObject({ missRate: 100 })
    expect(summary.serve.byPlayer[2]).toMatchObject({ efficiency: 25, reference: true })
    expect(summary.serve.unassigned).toBe(0)
  })

  it('名簿にない選手は byPlayer に入れず、本数を unassigned に出す（total と合計が合う）', () => {
    const unknown = buildAiSummary({ players: [], sets })
    expect(unknown.serve.byPlayer).toEqual([])
    expect(unknown.serve.total.attempts).toBe(6)
    expect(unknown.serve.unassigned).toBe(6)
    // 相手ミス（選手がいない）は unassigned に数えない
    expect(unknown.reception.unassigned).toBe(2)
    expect(unknown.attack.unassigned).toBe(2)
    const known = buildAiSummary({ players, sets })
    expect(known.reception.unassigned).toBe(0)
  })

  it('サーブ：種類別と、着弾ゾーン別の本数と崩し率（本数のあるゾーンだけ）', () => {
    expect(summary.serve.byType.map((t) => [t.type, t.attempts])).toEqual([
      ['float', 5],
      ['jump', 1],
    ])
    // 崩し率 =（エース＋C＋D）÷ 本数。ゾーン 2：エース・C・A の3本 → 2 ÷ 3 = 66.7%、ゾーン 5：D の1本 → 100%
    expect(summary.serve.byLandingZone).toEqual([
      { zone: 2, attempts: 3, breakRate: 66.7, reference: true },
      { zone: 5, attempts: 1, breakRate: 100, reference: true },
    ])
  })

  it('エースが多いゾーンは崩し率が高い（エースを分母だけに入れない）', () => {
    const aces = [
      ...Array.from({ length: 5 }, () => serve({ result: 'ace', reception: null, toX: 0.1, toY: 0.1 })),
      ...Array.from({ length: 5 }, () => serve({ reception: 'A', toX: 0.1, toY: 0.1 })),
    ]
    const s = buildAiSummary({ players, sets: [{ matchNo: 1, setNo: 1, ourScore: 0, oppScore: 0, records: records('s1', { serves: aces }) }] })
    expect(s.serve.byLandingZone).toEqual([{ zone: 2, attempts: 10, breakRate: 50, reference: false }])
  })

  it('レシーブ：受数・成功率・被エース率、位置別、相手のサーブの種類別', () => {
    expect(summary.reception.total).toEqual({
      receptions: 2,
      successRate: 50,
      acedRate: 0,
      reference: true,
    })
    expect(summary.reception.byPlayer.map((p) => [p.number, p.retired])).toEqual([
      [3, false],
      [7, false],
    ])
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

  it('相手ミスだけだった相手のサーブの種類は入れない（受数 0 の行を出さない）', () => {
    const only = records('s1', {
      receptions: [
        reception({ result: 'opp_miss', receiverId: null, oppServeType: 'jump' }),
        reception({ result: 'A', oppServeType: 'float' }),
      ],
    })
    const s = buildAiSummary({ players, sets: [{ matchNo: 1, setNo: 1, ourScore: 0, oppScore: 0, records: only }] })
    expect(s.reception.byOppServeType.map((t) => t.type)).toEqual(['float'])
  })

  it('並びは記録の順で変わらない：種類は決まった順、評価は A〜D', () => {
    const mk = (order: 'forward' | 'reverse') => {
      const r = records('s1', {
        serves: ['other', 'float', 'jump'].map((serveType) => serve({ serveType: serveType as 'other' | 'float' | 'jump' })),
        attacks: ['D', 'A', 'C'].map((g) => attack({ prevReception: g as 'D' | 'A' | 'C' })),
      })
      if (order === 'reverse') {
        r.serves.reverse()
        r.attacks.reverse()
      }
      return buildAiSummary({ players, sets: [{ matchNo: 1, setNo: 1, ourScore: 0, oppScore: 0, records: r }] })
    }
    for (const order of ['forward', 'reverse'] as const) {
      const s = mk(order)
      expect(s.serve.byType.map((t) => t.type)).toEqual(['float', 'jump', 'other'])
      expect(s.attack.byPrevReception.map((t) => t.grade)).toEqual(['A', 'C', 'D'])
    }
  })

  it('複数の試合のセットは、試合の通し番号とセット番号で区別して並べる', () => {
    const set = (matchNo: number, setNo: number) => ({
      matchNo,
      setNo,
      ourScore: setNo,
      oppScore: matchNo,
      records: records(`m${matchNo}s${setNo}`, {}),
    })
    const s = buildAiSummary({ players, sets: [set(2, 1), set(1, 2), set(2, 2), set(1, 1)] })
    expect(s.sets.map((x) => [x.matchNo, x.setNo])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ])
  })

  it('マイナスの効果率の丸めは、プラスと同じ向き（−6.25 → −6.3、6.25 → 6.3）', () => {
    // 20 本：エース 1・ミス 9・A 10 →（100 − 225）÷ 20 = −6.25
    const minus = [
      serve({ result: 'ace', reception: null }),
      ...Array.from({ length: 9 }, () => serve({ result: 'miss', reception: null, missType: 'net' })),
      ...Array.from({ length: 10 }, () => serve({ reception: 'A' })),
    ]
    const s = buildAiSummary({ players, sets: [{ matchNo: 1, setNo: 1, ourScore: 0, oppScore: 0, records: records('s1', { serves: minus }) }] })
    expect(s.serve.total.efficiency).toBe(-6.3)
    // 値が 0 に丸まるときは -0 にしない
    const tiny = buildAiSummary({ players, sets: [{ matchNo: 1, setNo: 1, ourScore: 0, oppScore: 0, records: records('s1', { serves: [...Array.from({ length: 1999 }, () => serve({ reception: 'A' })), serve({ result: 'miss', reception: null, missType: 'net' })] }) }] })
    expect(Object.is(tiny.serve.total.efficiency, 0)).toBe(true)
  })

  it('10 本以上の項目は reference が false', () => {
    const many = buildAiSummary({
      players,
      sets: [{ matchNo: 1, setNo: 1, ourScore: 0, oppScore: 0, records: records('s1', { serves: Array.from({ length: 10 }, () => serve()) }) }],
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

describe('練習の記録', () => {
  it('練習のサーブ（targetZone あり）は、打数にも指標にも入れない', () => {
    // 試合：エース 1・A 1（効果率 50%）。練習：評価のないイン 10 本
    const mixed = [
      serve({ result: 'ace', reception: null }),
      serve({ reception: 'A' }),
      ...Array.from({ length: 10 }, () => serve({ reception: null, targetZone: 5 })),
    ]
    const s = buildAiSummary({
      players,
      sets: [{ matchNo: 1, setNo: 1, ourScore: 0, oppScore: 0, records: records('s1', { serves: mixed }) }],
    })
    expect(s.serve.total).toMatchObject({ attempts: 2, efficiency: 50 })
    expect(s.sets[0]?.serve.attempts).toBe(2)
    expect(s.serve.byPlayer[0]?.attempts).toBe(2)
    expect(s.serve.unassigned).toBe(0)
  })

  it('練習のサーブだけなら、サーブは 0 本・率は null（reference は true）', () => {
    const only = [serve({ reception: null, targetZone: 1 })]
    const s = buildAiSummary({
      players,
      sets: [{ matchNo: 1, setNo: 1, ourScore: 0, oppScore: 0, records: records('s1', { serves: only }) }],
    })
    expect(s.serve.total).toEqual({ attempts: 0, efficiency: null, aceRate: null, missRate: null, reference: true })
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
