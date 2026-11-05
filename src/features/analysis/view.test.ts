import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  GameSet,
  OppAttackRecord,
  OppAttackResult,
  Match,
  Opponent,
  Player,
  ReceptionRecord,
  ServeRecord,
  SetRecords,
} from '../../contracts/index.ts'
import {
  courseHeatmap,
  digView,
  heatmap,
  overallMetrics,
  playerTable,
  practiceView,
  recordsInScope,
  scopeOptions,
  serveTypeTable,
  speedTable,
  splitPractice,
  attackTableForScrimmage,
  type AnalysisData,
} from './view.ts'

const player = (id: string, number: number, name: string): Player => ({
  id,
  teamId: 't',
  number,
  name,
  position: null,
  serveType: 'float',
  active: true,
})

const serve = (o: Partial<ServeRecord> = {}): ServeRecord => ({
  kind: 'serve',
  clientId: 'c',
  setId: 's1',
  serverId: 'p7',
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

const empty = (setId: string): SetRecords => ({
  setId,
  serves: [],
  receptions: [],
  attacks: [],
  points: [],
})

const match = (id: string, o: Partial<Match> = {}): Match => ({
  id,
  teamId: 't',
  kind: 'match',
  opponentId: 'oppA',
  date: '2026-10-20',
  tournament: null,
  setPoints: 25,
  ...o,
})
const gameSet = (id: string, matchId: string, setNo: number): GameSet => ({
  id,
  matchId,
  setNo,
  ourScore: 0,
  oppScore: 0,
})
const opponents: Opponent[] = [
  { id: 'oppA', teamId: 't', name: 'A高校' },
  { id: 'oppB', teamId: 't', name: 'B高校' },
]
const players = [player('p7', 7, '渡辺'), player('p3', 3, '佐藤')]

// m1（A高校）：s1・s2、m2（B高校）：s3、練習 pr：s4
const data: AnalysisData = {
  players,
  opponents,
  matches: [
    match('m1'),
    match('m2', { opponentId: 'oppB', date: '2026-10-25' }),
    match('pr', { kind: 'practice', opponentId: null }),
  ],
  gameSets: [gameSet('s1', 'm1', 1), gameSet('s2', 'm1', 2), gameSet('s3', 'm2', 1), gameSet('s4', 'pr', 1)],
  records: [empty('s1'), empty('s2'), empty('s3'), empty('s4')],
}

describe('recordsInScope', () => {
  const ids = (scope: Parameters<typeof recordsInScope>[0]) =>
    recordsInScope(scope, data).map((r) => r.setId)

  it('全体は試合だけ。練習は混ぜない', () => {
    expect(ids({ kind: 'all' })).toEqual(['s1', 's2', 's3'])
  })
  it('練習', () => {
    expect(ids({ kind: 'practice' })).toEqual(['s4'])
  })
  it('試合・セット・相手', () => {
    expect(ids({ kind: 'match', matchId: 'm1' })).toEqual(['s1', 's2'])
    expect(ids({ kind: 'set', setId: 's3' })).toEqual(['s3'])
    expect(ids({ kind: 'opponent', opponentId: 'oppB' })).toEqual(['s3'])
  })
  it('セットの試合が分からない記録は入れない', () => {
    const orphan = { ...data, records: [...data.records, empty('zzz')] }
    expect(recordsInScope({ kind: 'all' }, orphan)).toHaveLength(3)
  })
})

describe('overallMetrics', () => {
  // 4本：エース1・効果(C)1・ミス1・A1 →（100 + 25 − 25）÷ 4 = 25%
  const sets: SetRecords[] = [
    {
      ...empty('s1'),
      serves: [
        serve({ result: 'ace', reception: null }),
        serve({ reception: 'C' }),
        serve({ result: 'miss', reception: null, missType: 'net' }),
        serve({ reception: 'A' }),
      ],
    },
  ]

  it('サーブ：打数・サーブ効果率・エース率・ミス率の順。10 本未満は参考値', () => {
    const m = overallMetrics('serve', sets)
    expect(m.map((x) => x.label)).toEqual(['打数', 'サーブ効果率', 'エース率', 'ミス率'])
    expect(m.map((x) => x.cell.text)).toEqual(['4', '25.0%*', '25.0%*', '25.0%*'])
    expect(m[0]?.cell.reference).toBe(false)
    expect(m[1]?.cell.reference).toBe(true)
  })

  it('レシーブ：受数・サーブレシーブ成功率・被エース率の順', () => {
    expect(overallMetrics('reception', []).map((x) => x.label)).toEqual([
      '受数',
      'サーブレシーブ成功率',
      '被エース率',
    ])
  })

  it('アタック：打数・アタック決定率・効果率・失点の順', () => {
    expect(overallMetrics('attack', []).map((x) => x.label)).toEqual([
      '打数',
      'アタック決定率',
      '効果率',
      '失点',
    ])
  })

  it('記録がないと打数 0、率は「−」', () => {
    expect(overallMetrics('serve', []).map((x) => x.cell.text)).toEqual(['0', '−', '−', '−'])
  })

  it('マイナスの効果率は negative になる', () => {
    const bad = [{ ...empty('s1'), serves: [serve({ result: 'miss', reception: null, missType: 'net' })] }]
    const eff = overallMetrics('serve', bad)[1]
    expect(eff?.cell.text).toBe('−25.0%*')
    expect(eff?.cell.negative).toBe(true)
  })

  it('10 本以上なら参考値の「*」が付かない', () => {
    const ten = [{ ...empty('s1'), serves: Array.from({ length: 10 }, () => serve({ reception: 'A' })) }]
    expect(overallMetrics('serve', ten)[1]?.cell).toEqual({ text: '0.0%', reference: false, negative: false })
  })
})

describe('playerTable・serveTypeTable', () => {
  const sets: SetRecords[] = [
    {
      ...empty('s1'),
      serves: [
        serve({ serverId: 'p7', result: 'ace', reception: null }),
        serve({ serverId: 'p3', reception: 'D', serveType: 'jump' }),
        serve({ serverId: 'p3', reception: 'A', serveType: 'jump' }),
      ],
    },
  ]

  it('選手別は背番号順で、「3 佐藤」のように背番号と名前を並べる', () => {
    const t = playerTable('serve', sets, players)
    expect(t.rows.map((r) => r.label)).toEqual(['3 佐藤', '7 渡辺'])
    expect(t.rows[0]?.cells.map((c) => c.text)).toEqual(['2', '12.5%*', '0.0%*', '0.0%*'])
    expect(t.rows[1]?.cells[1]?.text).toBe('100.0%*')
  })

  it('選手が見つからないときは「?」', () => {
    expect(playerTable('serve', sets, []).rows.map((r) => r.label)).toEqual(['?', '?'])
  })

  it('サーブの種類別は記録のある種類だけ', () => {
    const t = serveTypeTable(sets)
    expect(t.rows.map((r) => r.label)).toEqual(['フローター', 'ジャンプサーブ'])
    expect(t.rows[1]?.cells[1]?.text).toBe('12.5%*')
  })
})

describe('heatmap：色の濃さとマイナス', () => {
  const zoneServes = (n: number, toX: number, toY: number, result: ServeRecord['result'], reception: ServeRecord['reception']) =>
    Array.from({ length: n }, () => serve({ toX, toY, result, reception, missType: result === 'miss' ? 'other' : null }))

  it('値の絶対値の最大を 1 にそろえる（効果率が 10〜30% 程度でも濃淡が出る）', () => {
    const sets = [
      {
        ...empty('s1'),
        serves: [
          ...zoneServes(4, 0.1, 0.1, 'in', 'C'), // ゾーン 2：C のみ → 25%
          ...zoneServes(4, 0.5, 0.1, 'in', 'A'), // ゾーン 3：A のみ → 0%
          ...zoneServes(2, 0.9, 0.1, 'ace', null), // ゾーン 4：エースのみ → 100%
        ],
      },
    ]
    const by = new Map(heatmap('serve', sets).cells.map((c) => [c.zone, c]))
    expect(by.get(4)?.intensity).toBe(1)
    expect(by.get(2)?.intensity).toBe(0.25)
    expect(by.get(3)?.intensity).toBe(0)
  })

  it('マイナスのゾーンは negative で、記録のないゾーンと区別できる', () => {
    // ゾーン 2 のミスは座標がコート内（着弾がゾーンに入る）で、効果率はマイナス
    const sets = [{ ...empty('s1'), serves: zoneServes(12, 0.1, 0.1, 'miss', null) }]
    const by = new Map(heatmap('serve', sets).cells.map((c) => [c.zone, c]))
    expect(by.get(2)).toMatchObject({ text: '−25.0%（12）', negative: true, reference: false, intensity: 1 })
    expect(by.get(1)).toMatchObject({ text: '−（0）', negative: false, intensity: 0 })
  })
})

describe('表の行の key', () => {
  it('名簿にない選手が 2 人いても、行の id は重ならない（表示名は同じ「?」）', () => {
    const sets = [
      {
        ...empty('s1'),
        serves: [serve({ serverId: 'x1' }), serve({ serverId: 'x2' })],
      },
    ]
    const rows = playerTable('serve', sets, []).rows
    expect(rows.map((r) => r.label)).toEqual(['?', '?'])
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })
})

describe('heatmap', () => {
  it('サーブ：相手コートの 6 ゾーンすべてに値と本数を出す', () => {
    const sets = [
      {
        ...empty('s1'),
        serves: [
          serve({ toX: 0.1, toY: 0.1, result: 'ace', reception: null }), // ゾーン 2
          serve({ toX: 0.1, toY: 0.1, reception: 'A' }), // ゾーン 2
        ],
      },
    ]
    const h = heatmap('serve', sets)
    expect(h.side).toBe('opponent')
    expect(h.cells.map((c) => c.zone)).toEqual([1, 2, 3, 4, 5, 6])
    const z2 = h.cells.find((c) => c.zone === 2)
    expect(z2).toMatchObject({ text: '50.0%*（2）', count: 2, reference: true, negative: false, intensity: 1 })
    expect(h.cells.find((c) => c.zone === 1)).toMatchObject({ text: '−（0）', intensity: 0 })
  })

  it('レシーブ：自コートの受けた位置別', () => {
    const sets = [
      {
        ...empty('s1'),
        receptions: [
          {
            kind: 'reception' as const,
            clientId: 'c',
            setId: 's1',
            receiverId: 'p7',
            oppServerId: null,
            oppServeType: null,
            atX: 0.1,
            atY: 0.1, // 自コートのネット側の左 = ゾーン 4
            result: 'A' as const,
            recordedAt: '2026-10-29T00:00:00Z',
          },
        ],
      },
    ]
    const h = heatmap('reception', sets)
    expect(h.side).toBe('own')
    expect(h.cells.find((c) => c.zone === 4)).toMatchObject({ text: '100.0%*（1）', intensity: 1 })
  })
})

describe('practiceView', () => {
  const sets = [
    {
      ...empty('s4'),
      serves: [
        serve({ targetZone: 5, toX: 0.9, toY: 0.9 }), // 狙いどおり
        serve({ targetZone: 5, toX: 0.9, toY: 0.1 }), // 外れ
        serve({ targetZone: 5, result: 'miss', reception: null, missType: 'out', toX: 0.9, toY: 1.1 }),
      ],
    },
  ]
  it('成功率とゾーン的中率', () => {
    const v = practiceView(sets, players)
    expect(v.metrics.map((m) => m.label)).toEqual(['本数', '成功率', 'ゾーン的中率'])
    expect(v.metrics.map((m) => m.cell.text)).toEqual(['3', '66.7%*', '33.3%*'])
    expect(v.table.rows[0]?.label).toBe('7 渡辺')
    expect(v.heatmap.cells.find((c) => c.zone === 5)?.text).toBe('33.3%*（3）')
  })
})

describe('scopeOptions：並び', () => {
  it('試合は日付順、セットは試合の日付順にセット番号順（読み込み順に依らない）', () => {
    const shuffled: AnalysisData = {
      ...data,
      matches: [...data.matches].reverse(),
      gameSets: [...data.gameSets].reverse(),
    }
    expect(scopeOptions('match', shuffled).map((o) => o.value)).toEqual(['m1', 'm2'])
    expect(scopeOptions('set', shuffled).map((o) => o.label)).toEqual([
      '2026-10-20 A高校 第1セット',
      '2026-10-20 A高校 第2セット',
      '2026-10-25 B高校 第1セット',
    ])
  })
})

describe('scopeOptions', () => {
  it('試合・相手・セットの選択肢。練習は含めない', () => {
    expect(scopeOptions('match', data).map((o) => o.label)).toEqual(['2026-10-20 A高校', '2026-10-25 B高校'])
    expect(scopeOptions('opponent', data).map((o) => o.value)).toEqual(['oppA', 'oppB'])
    expect(scopeOptions('set', data).map((o) => o.label)).toEqual([
      '2026-10-20 A高校 第1セット',
      '2026-10-20 A高校 第2セット',
      '2026-10-25 B高校 第1セット',
    ])
  })
})

describe('courseHeatmap（コース割合）', () => {
  // 相手コートの奥の列（y=0.5）は x=0.1→ゾーン1、0.5→6。ネット側（y=0.1）は x=0.1→2
  const sets: SetRecords[] = [
    {
      ...empty('s1'),
      serves: [
        ...Array.from({ length: 12 }, (_, i) => serve({ clientId: `a${i}`, toX: 0.1, toY: 0.5 })), // ゾーン1：12 本
        ...Array.from({ length: 3 }, (_, i) => serve({ clientId: `b${i}`, toX: 0.1, toY: 0.1 })), // ゾーン2：3 本
        serve({ clientId: 'net', toX: null, toY: null, result: 'miss', missType: 'net', reception: null }),
      ],
    },
  ]

  it('サーブ：相手コートの着弾ゾーン別の割合と本数を出す（12/15 = 80.0%、3/15 = 20.0%）', () => {
    const map = courseHeatmap('serve', sets)
    expect(map.side).toBe('opponent')
    expect(map.metric).toBe('コース割合')
    const by = new Map(map.cells.map((c) => [c.zone, c]))
    expect(by.get(1)?.text).toBe('80.0%（12）')
    expect(by.get(2)?.text).toBe('20.0%*（3）') // 3 本は 10 本未満なので参考値
    expect(by.get(3)?.text).toBe('0.0%*（0）')
  })

  it('割合が大きいほど濃く、最大のゾーンが 1', () => {
    const by = new Map(courseHeatmap('serve', sets).cells.map((c) => [c.zone, c]))
    expect(by.get(1)?.intensity).toBe(1)
    expect(by.get(2)?.intensity).toBe(0.25) // 20 ÷ 80
  })

  it('レシーブ：自コートの受けた位置別。位置のないレシーブは分母に入れない', () => {
    const rec = (id: string, atX: number | null, atY: number | null): ReceptionRecord => ({
      kind: 'reception',
      clientId: id,
      setId: 's1',
      receiverId: 'p7',
      oppServerId: null,
      oppServeType: null,
      atX,
      atY,
      result: 'A',
      recordedAt: '2026-11-05T00:00:00Z',
    })
    const map = courseHeatmap('reception', [
      { ...empty('s1'), receptions: [rec('r1', 0.5, 0.5), rec('r2', 0.5, 0.5), rec('r3', 0.9, 0.5), rec('r4', 0.9, 0.5), rec('r5', null, null)] },
    ])
    expect(map.side).toBe('own')
    const by = new Map(map.cells.map((c) => [c.zone, c]))
    expect(by.get(6)?.text).toBe('50.0%*（2）') // 2/4
    expect(by.get(1)?.text).toBe('50.0%*（2）')
  })
})

describe('speedTable（速さ別。5 章：全体指標と同じ式、速さなしはどちらにも入れない）', () => {
  const atk = (o: Partial<AttackRecord>): AttackRecord => ({
    kind: 'attack',
    clientId: 'a',
    setId: 's1',
    attackerId: 'p7',
    attackType: null,
    isBack: false,
    toX: null,
    toY: null,
    result: 'kill',
    prevReception: null,
    recordedAt: '2026-11-05T00:00:00Z',
    ...o,
  })

  it('サーブ：速い＝エース1・C1・ミス1 の3本 → 33.3%*、遅い＝A1 の1本 → 0.0%*。速さなしは入れない', () => {
    const t = speedTable('serve', [
      {
        ...empty('s1'),
        serves: [
          serve({ speed: 'fast', result: 'ace', reception: null }),
          serve({ speed: 'fast', reception: 'C' }),
          serve({ speed: 'fast', result: 'miss', reception: null, missType: 'net' }),
          serve({ speed: 'slow', reception: 'A' }),
          serve({ speed: null, result: 'ace', reception: null }),
        ],
      },
    ])
    expect(t?.columns).toEqual(['打数', 'サーブ効果率', 'エース率', 'ミス率'])
    expect(t?.rows.map((r) => [r.label, r.cells.map((c) => c.text)])).toEqual([
      ['速い', ['3', '33.3%*', '33.3%*', '33.3%*']],
      ['遅い', ['1', '0.0%*', '0.0%*', '0.0%*']],
    ])
  })

  it('アタック：速い＝決定1・継続1 → 決定率 50.0%*', () => {
    const t = speedTable('attack', [
      { ...empty('s1'), attacks: [atk({ speed: 'fast' }), atk({ speed: 'fast', result: 'continue' })] },
    ])
    expect(t?.rows).toHaveLength(1)
    expect(t?.rows[0]?.cells[1]?.text).toBe('50.0%*')
  })

  it('速さを入れた記録がない・レシーブは null', () => {
    expect(speedTable('serve', [{ ...empty('s1'), serves: [serve()] }])).toBeNull()
    expect(speedTable('reception', [empty('s1')])).toBeNull()
  })
})

describe('digView（相手のスパイク。要件定義書 5 章の計算例）', () => {
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
  const times = (n: number, r: OppAttackResult): OppAttackRecord[] => Array.from({ length: n }, () => opp(r))
  // 10 本：A3・B2・C1・拾えず3・相手ミス1 → 拾えた率 6 ÷ 9 × 100 ≒ 66.7%（分母 9 本は 10 本未満なので参考値「*」）
  const sets: SetRecords[] = [
    { ...empty('s1'), oppAttacks: [...times(3, 'A'), ...times(2, 'B'), ...times(1, 'C')] },
    { ...empty('s2'), oppAttacks: [...times(3, 'killed'), ...times(1, 'opp_error')] },
  ]

  it('本数・拾えた率・拾えず・相手ミスを出す（セットをまたいで合計）', () => {
    const texts = Object.fromEntries(digView(sets).metrics.map((m) => [m.label, m.cell.text]))
    expect(texts).toEqual({ 相手のスパイク: '10', 拾えた率: '66.7%*', 拾えず: '3', 相手ミス: '1' })
  })

  it('拾えた率の分母（拾えた＋拾えず）が 10 本以上なら「*」を付けない', () => {
    const big: SetRecords[] = [{ ...empty('s1'), oppAttacks: [...times(8, 'A'), ...times(2, 'killed')] }]
    const cell = digView(big).metrics.find((m) => m.label === '拾えた率')?.cell
    expect(cell).toEqual({ text: '80.0%', reference: false, negative: false })
  })

  it('記録がなければ「−」', () => {
    const v = digView([empty('s1')])
    expect(v.metrics.find((m) => m.label === '拾えた率')?.cell.text).toBe('−')
    expect(v.landing.cells.every((c) => c.count === 0)).toBe(true)
  })

  it('位置の割合：落ちた位置は自コート、打ってくる位置は相手コート', () => {
    const v = digView([
      {
        ...empty('s1'),
        oppAttacks: [
          opp('A', { fromX: 0.1, fromY: 0.1, toX: 0.1, toY: 0.9 }),
          opp('killed', { fromX: 0.1, fromY: 0.1, toX: 0.5, toY: 0.9 }),
        ],
      },
    ])
    expect(v.landing.side).toBe('own')
    expect(v.origin.side).toBe('opponent')
    const text = (h: typeof v.landing, zone: number) => h.cells.find((c) => c.zone === zone)?.text
    expect(text(v.landing, 5)).toBe('50.0%*（1）')
    expect(text(v.landing, 6)).toBe('50.0%*（1）')
    expect(text(v.origin, 2)).toBe('100.0%*（2）')
  })
})

describe('範囲「練習」と紅白戦（5 章「紅白戦の個人成績」）', () => {
  // 試合 m1（s1）、練習 pr（s4）、紅白戦 sc（s5）
  const withScrimmage: AnalysisData = {
    ...data,
    matches: [...data.matches, match('sc', { kind: 'scrimmage', opponentId: 'b1' })],
    gameSets: [...data.gameSets, gameSet('s5', 'sc', 1)],
    records: [...data.records, empty('s5')],
  }
  const ids = (scope: Parameters<typeof recordsInScope>[0]) =>
    recordsInScope(scope, withScrimmage).map((r) => r.setId)

  it('練習の範囲には、サーブ練習と紅白戦の両方が入る', () => {
    expect(ids({ kind: 'practice' })).toEqual(['s4', 's5'])
  })
  it('試合の全体・相手・試合には、紅白戦を入れない', () => {
    expect(ids({ kind: 'all' })).toEqual(['s1', 's2', 's3'])
    expect(ids({ kind: 'opponent', opponentId: 'b1' })).toEqual([])
  })
  it('紅白戦の相手（Bチーム）は、相手の選択肢に出ない', () => {
    const opts = scopeOptions('opponent', {
      ...withScrimmage,
      opponents: [...opponents, { id: 'b1', teamId: 't', name: '紅白戦（B チーム）' }],
    })
    expect(opts.map((o) => o.value)).not.toContain('b1')
  })
  it('splitPractice：紅白戦とサーブ練習に分ける（サーブ練習の指標に紅白戦のサーブを混ぜない）', () => {
    const sets = recordsInScope({ kind: 'practice' }, withScrimmage)
    const { scrimmage, drill } = splitPractice(sets, withScrimmage)
    expect(scrimmage.map((r) => r.setId)).toEqual(['s5'])
    expect(drill.map((r) => r.setId)).toEqual(['s4'])
  })
})

describe('紅白戦：Bチームの部員（5 章「紅白戦の個人成績」、#71）', () => {
  const sc: AnalysisData = {
    ...data,
    matches: [...data.matches, match('sc', { kind: 'scrimmage', opponentId: 'b1' })],
    gameSets: [...data.gameSets, gameSet('s5', 'sc', 1)],
    opponentPlayers: [{ id: 'b7', opponentId: 'b1', number: 7, playerId: 'p7' }],
    records: [
      ...data.records,
      {
        ...empty('s5'),
        serves: [serve({ setId: 's5', serverId: 'p3', result: 'ace', reception: null, receiverId: 'b7' })],
        // 相手サーバー b7（部員 p7）のサーブを受けた記録。b9 は部員と結ばれていない
        receptions: [
          {
            kind: 'reception',
            clientId: 'r1',
            setId: 's5',
            receiverId: 'p3',
            oppServerId: 'b7',
            oppServeType: null,
            atX: null,
            atY: null,
            result: 'C',
            recordedAt: '2026-11-05T00:00:00Z',
          },
          {
            kind: 'reception',
            clientId: 'r2',
            setId: 's5',
            receiverId: 'p3',
            oppServerId: 'b9',
            oppServeType: null,
            atX: null,
            atY: null,
            result: 'ace',
            recordedAt: '2026-11-05T00:00:00Z',
          },
        ],
      },
    ],
  }
  it('Bチームの記録を、その部員の記録として足す（部員と結ばれていない相手選手は入れない）', () => {
    const { scrimmage } = splitPractice(recordsInScope({ kind: 'practice' }, sc), sc)
    const r = scrimmage.find((x) => x.setId === 's5')
    // サーブ：A の 1 本 ＋ B の部員 p7 の 1 本（C＝効果）。b9 は入らない
    expect(r?.serves.map((x) => x.serverId)).toEqual(['p3', 'p7'])
    // レシーブ：A の受けた 2 本 ＋ B の部員 p7 が受けた分（エースは受けた相手がないので 0 本）
    expect(r?.receptions).toHaveLength(2)
  })
  it('部員の選手別表に A と B が合わさる', () => {
    const { scrimmage } = splitPractice(recordsInScope({ kind: 'practice' }, sc), sc)
    const t = playerTable('serve', scrimmage, sc.players)
    // 渡辺（p7）は B のサーブ 1 本：C 1 本 → 効果 1 →（25）÷ 1 = 25%
    const row = t.rows.find((x) => x.id === 'p7')
    expect(row?.cells.map((c) => c.text)).toEqual(['1', '25.0%*', '0.0%*', '0.0%*'])
  })
  it('opponentPlayers がなければ、Aの記録のまま', () => {
    const none = { ...sc, opponentPlayers: undefined }
    const { scrimmage } = splitPractice(recordsInScope({ kind: 'practice' }, none), none)
    expect(scrimmage.find((x) => x.setId === 's5')?.serves).toHaveLength(1)
  })
  it('紅白戦のアタックの表は、効果率と失点の列を除く', () => {
    const t = attackTableForScrimmage({
      columns: ['打数', 'アタック決定率', '効果率', '失点'],
      rows: [{ id: 'p7', label: '7 渡辺', cells: [1, 2, 3, 4].map((n) => ({ text: String(n), reference: false, negative: false })) }],
    })
    expect(t.columns).toEqual(['打数', 'アタック決定率'])
    expect(t.rows[0]?.cells.map((c) => c.text)).toEqual(['1', '2'])
  })
})
