import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  GameSet,
  Player,
  PointRecord,
  ServeRecord,
  SetRecords,
} from '../../contracts/index.ts'
import { scoreTrend, setPointsOf, setResults, setScoreOf } from './setResults.ts'
import type { AnalysisData } from './view.ts'

const players: Player[] = [
  { id: 'p7', teamId: 't', number: 7, name: '渡辺', position: null, serveType: 'float', active: true },
  { id: 'p3', teamId: 't', number: 3, name: '佐藤', position: null, serveType: 'float', active: true },
]

const serve = (clientId: string, o: Partial<ServeRecord> = {}): ServeRecord => ({
  kind: 'serve',
  clientId,
  setId: 's1',
  serverId: 'p7',
  serveType: 'float',
  fromX: null,
  toX: null,
  toY: null,
  result: 'in',
  missType: null,
  reception: 'A',
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-10-20T00:00:00Z',
  ...o,
})
const attack = (clientId: string, o: Partial<AttackRecord> = {}): AttackRecord => ({
  kind: 'attack',
  clientId,
  setId: 's1',
  attackerId: 'p3',
  attackType: null,
  isBack: false,
  toX: null,
  toY: null,
  result: 'kill',
  prevReception: null,
  recordedAt: '2026-10-20T00:00:00Z',
  ...o,
})
const point = (n: number, o: Partial<PointRecord>): PointRecord => ({
  kind: 'point',
  clientId: `pt${n}`,
  setId: 's1',
  side: 'us',
  cause: 'manual',
  sourceId: null,
  ourScore: 0,
  oppScore: 0,
  recordedAt: `2026-10-20T00:00:${String(n).padStart(2, '0')}Z`,
  ...o,
})
const gameSet = (id: string, setNo: number, our = 0, opp = 0): GameSet => ({
  id,
  matchId: 'm1',
  setNo,
  ourScore: our,
  oppScore: opp,
})
const empty = (setId: string): SetRecords => ({ setId, serves: [], receptions: [], attacks: [], points: [] })

describe('setScoreOf', () => {
  it('得点の記録があれば side ごとに数える（保存された ourScore・oppScore は使わない）', () => {
    // 自 1-0、相 1-1、自 2-1 のあとに相手側の最後の得点を消した（−1）。あとの記録の値は古いまま
    const set = {
      ...empty('s1'),
      points: [
        point(1, { side: 'us', ourScore: 1, oppScore: 0 }),
        point(3, { side: 'us', ourScore: 2, oppScore: 1 }),
      ],
    }
    expect(setScoreOf(set, gameSet('s1', 1, 9, 9))).toEqual({ our: 2, opp: 0 })
  })
  it('なければセットに保存された得点', () => {
    expect(setScoreOf(empty('s1'), gameSet('s1', 1, 25, 22))).toEqual({ our: 25, opp: 22 })
  })
})

describe('setPointsOf', () => {
  it('5 セット目は FINAL_SET_POINTS、それ以外は試合の点数。正の整数でなければ初期値', () => {
    expect(setPointsOf(5, 25)).toBe(15)
    expect(setPointsOf(3, 21)).toBe(21)
    expect(setPointsOf(1, 0)).toBe(25)
    expect(setPointsOf(1, Number.NaN)).toBe(25)
  })
})

describe('setResults', () => {
  const data: AnalysisData = {
    players,
    opponents: [],
    matches: [],
    gameSets: [gameSet('s2', 2, 20, 25), gameSet('s1', 1, 25, 22), { ...gameSet('x', 1), matchId: 'other' }],
    records: [
      {
        ...empty('s1'),
        // サーブ：エース1・ミス1・A1（打数3）→（100 − 25）÷ 3 = 25%、ミス1
        serves: [
          serve('a', { result: 'ace', reception: null }),
          serve('b', { result: 'miss', reception: null, missType: 'net' }),
          serve('c'),
        ],
        // アタック：決定1・被ブロック1 → 決定率 50%、失点1
        attacks: [attack('d'), attack('e', { result: 'blocked' })],
      },
    ],
  }

  it('セット番号順に、得点と指標と、ミス数（サーブミス＋アタックのミス）を並べる', () => {
    const t = setResults('m1', data)
    expect(t.columns).toEqual(['サーブ効果率', 'サーブレシーブ成功率', 'アタック決定率', 'ミス数'])
    expect(t.rows.map((r) => [r.setNo, r.score, r.won])).toEqual([
      [1, '25-22', true],
      [2, '20-25', false],
    ])
    // ミス数：サーブミス 1。被ブロックはミスに入れない
    expect(t.rows[0]?.cells.map((c) => c.text)).toEqual(['25.0%*', '−', '50.0%*', '1'])
  })

  it('記録がないセットは本数 0 で出す。ほかの試合のセットは入れない', () => {
    const row = setResults('m1', data).rows[1]
    expect(row?.cells.map((c) => c.text)).toEqual(['−', '−', '−', '0'])
    expect(setResults('m1', data).rows).toHaveLength(2)
  })

  it('同点のセット（途中）は勝ち負けなし', () => {
    const t = setResults('m1', { ...data, gameSets: [gameSet('s1', 1, 3, 3)], records: [] })
    expect(t.rows[0]?.won).toBeNull()
  })

  it('途中のセットは、点数が上でも下でも勝ち負けなし（8-10 を負けにしない）。終わったら勝ち負け', () => {
    const row = (our: number, opp: number, setNo = 1) =>
      setResults('m1', { ...data, gameSets: [gameSet('s1', setNo, our, opp)], records: [] }).rows[0]
    expect(row(8, 10)?.won).toBeNull()
    expect(row(24, 20)?.won).toBeNull()
    expect(row(25, 24)?.won).toBeNull()
    expect(row(25, 23)?.won).toBe(true)
    expect(row(23, 25)?.won).toBe(false)
    // 5 セット目は 15 点
    expect(row(15, 13, 5)?.won).toBe(true)
    expect(row(15, 13, 1)?.won).toBeNull()
  })

  it('試合に 1 セットも記録がなくても、セットの行は出る（emptySet）', () => {
    expect(setResults('m1', { ...data, records: [] }).rows).toHaveLength(2)
  })
})

describe('scoreTrend', () => {
  const set: SetRecords = {
    ...empty('s1'),
    serves: [serve('sv1', { result: 'ace', reception: null })],
    attacks: [attack('at1', { result: 'blocked' })],
    receptions: [
      {
        kind: 'reception',
        clientId: 'rc1',
        setId: 's1',
        receiverId: 'p3',
        oppServerId: null,
        oppServeType: null,
        atX: null,
        atY: null,
        result: 'ace',
        recordedAt: '2026-10-20T00:00:00Z',
      },
    ],
    points: [
      point(3, { side: 'opp', cause: 'blocked', sourceId: 'at1', ourScore: 1, oppScore: 2 }),
      point(1, { side: 'us', cause: 'ace', sourceId: 'sv1', ourScore: 1, oppScore: 0 }),
      point(2, { side: 'opp', cause: 'aced', sourceId: 'rc1', ourScore: 1, oppScore: 1 }),
      point(4, { side: 'us', cause: 'manual', ourScore: 2, oppScore: 2 }),
    ],
  }

  it('何点目に、誰の何で得点・失点したかを順に並べる（得点は side を数えて出す）', () => {
    expect(scoreTrend(set, players)).toEqual([
      { id: 'pt1', no: 1, score: '1-0', side: 'us', text: '7 渡辺 サービスエース' },
      { id: 'pt2', no: 2, score: '1-1', side: 'opp', text: '3 佐藤 被エース' },
      { id: 'pt3', no: 3, score: '1-2', side: 'opp', text: '3 佐藤 被ブロック' },
      { id: 'pt4', no: 4, score: '2-2', side: 'us', text: 'ラリー' },
    ])
  })

  it('−1 で途中の得点が消えても、番号は 1 から続き、点数は残った得点を数える', () => {
    // 自 1-0、相 1-1、自 2-1 のうち、相手の得点（pt2）を消した。残りの記録には古い点数が入っている
    const removed: SetRecords = {
      ...empty('s1'),
      points: [
        point(1, { side: 'us', ourScore: 1, oppScore: 0 }),
        point(3, { side: 'us', ourScore: 2, oppScore: 1 }),
        point(4, { side: 'opp', ourScore: 2, oppScore: 2 }),
      ],
    }
    const rows = scoreTrend(removed, players)
    expect(rows.map((r) => [r.no, r.score])).toEqual([
      [1, '1-0'],
      [2, '2-0'],
      [3, '2-1'],
    ])
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
  })

  it('元の記録が見つからない・選手がいない原因は理由だけ', () => {
    const lost: SetRecords = { ...empty('s1'), points: [point(1, { cause: 'opp_miss', sourceId: 'gone', ourScore: 1 })] }
    expect(scoreTrend(lost, players)[0]?.text).toBe('相手のサーブミス')
  })

  it('選手が名簿にいないときは「?」', () => {
    expect(scoreTrend(set, [])[0]?.text).toBe('? サービスエース')
  })
})
