import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  Grade,
  Player,
  ReceptionRecord,
  ServeRecord,
  SetRecords,
} from '../../contracts/index.ts'
import { playerBarChart, scoreTrendChart } from './graphs.ts'
import type { TrendRow } from './setResults.ts'

const at = '2026-11-05T00:00:00Z'
const player = (id: string, number: number, name: string): Player => ({
  id,
  teamId: 't',
  number,
  name,
  position: null,
  serveType: 'float',
  active: true,
})
// 名簿は背番号の順でなく並べて、グラフが背番号順に直すことを確かめる
const players = [player('p7', 7, '渡辺'), player('p3', 3, '佐藤')]

const serve = (serverId: string, result: ServeRecord['result'], reception: Grade | null = null): ServeRecord => ({
  kind: 'serve',
  clientId: 'c',
  setId: 's1',
  serverId,
  serveType: 'float',
  fromX: 0.5,
  toX: 0.5,
  toY: 0.5,
  result,
  missType: result === 'miss' ? 'out' : null,
  reception,
  receiverId: null,
  targetZone: null,
  recordedAt: at,
})
const reception = (receiverId: string, result: ReceptionRecord['result']): ReceptionRecord => ({
  kind: 'reception',
  clientId: 'c',
  setId: 's1',
  receiverId,
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result,
  recordedAt: at,
})
const attack = (attackerId: string, result: AttackRecord['result']): AttackRecord => ({
  kind: 'attack',
  clientId: 'c',
  setId: 's1',
  attackerId,
  attackType: null,
  isBack: false,
  toX: null,
  toY: null,
  result,
  prevReception: null,
  recordedAt: at,
})
const times = <T,>(n: number, make: () => T): T[] => Array.from({ length: n }, make)
const set = (o: Partial<SetRecords>): SetRecords => ({
  setId: 's1',
  serves: [],
  receptions: [],
  attacks: [],
  points: [],
  ...o,
})

describe('playerBarChart（選手別の棒グラフ）', () => {
  it('サーブ：サーブ効果率とミス率を、背番号順に出す', () => {
    // 7番 10 本：エース1・ミス1・効果（C・D）3・A・B 5 → 効果率 =（100 + 75 − 25）÷ 10 = 15.0%、ミス率 10.0%
    // 3番 5 本：ミス1・A4 → 効果率 = −25 ÷ 5 = −5.0%、ミス率 20.0%
    const chart = playerBarChart(
      'serve',
      [
        set({
          serves: [
            serve('p7', 'ace'),
            serve('p7', 'miss'),
            ...times(3, () => serve('p7', 'in', 'C')),
            ...times(5, () => serve('p7', 'in', 'A')),
            serve('p3', 'miss'),
            ...times(4, () => serve('p3', 'in', 'A')),
          ],
        }),
      ],
      players,
    )
    expect(chart.labels).toEqual(['3 佐藤', '7 渡辺'])
    const [efficiency, missRate] = chart.series
    expect(efficiency?.name).toBe('サーブ効果率')
    expect(efficiency?.values).toEqual([-5, 15])
    expect(missRate?.name).toBe('ミス率')
    expect(missRate?.values).toEqual([20, 10])
  })

  it('表示の決まり：小数第1位の %、マイナスは「−」で色を変え、10 本未満には「*」を付けて薄くする', () => {
    const chart = playerBarChart(
      'serve',
      [
        set({
          serves: [
            serve('p7', 'ace'),
            serve('p7', 'miss'),
            ...times(3, () => serve('p7', 'in', 'C')),
            ...times(5, () => serve('p7', 'in', 'A')),
            serve('p3', 'miss'),
            ...times(4, () => serve('p3', 'in', 'A')),
          ],
        }),
      ],
      players,
    )
    const efficiency = chart.series[0]
    // 3番は 5 本（10 本未満）、7番はちょうど 10 本
    expect(efficiency?.texts).toEqual(['−5.0%*', '15.0%'])
    expect(efficiency?.reference).toEqual([true, false])
    expect(efficiency?.negative).toEqual([true, false])
  })

  it('レシーブ：サーブレシーブ成功率。受数 10 → （500 + 150）÷ 10 = 65.0%', () => {
    const chart = playerBarChart(
      'reception',
      [
        set({
          receptions: [
            ...times(5, () => reception('p7', 'A')),
            ...times(3, () => reception('p7', 'B')),
            ...times(2, () => reception('p7', 'C')),
          ],
        }),
      ],
      players,
    )
    expect(chart.labels).toEqual(['7 渡辺'])
    expect(chart.series).toHaveLength(1)
    expect(chart.series[0]?.name).toBe('サーブレシーブ成功率')
    expect(chart.series[0]?.values).toEqual([65])
    expect(chart.series[0]?.texts).toEqual(['65.0%'])
  })

  it('アタック：アタック決定率。打数 10・得点 4 → 40.0%', () => {
    const chart = playerBarChart(
      'attack',
      [set({ attacks: [...times(4, () => attack('p7', 'kill')), ...times(6, () => attack('p7', 'continue'))] })],
      players,
    )
    expect(chart.series[0]?.name).toBe('アタック決定率')
    expect(chart.series[0]?.values).toEqual([40])
    expect(chart.series[0]?.texts).toEqual(['40.0%'])
  })

  it('複数のセットの記録をまとめる。記録のない種類は空のグラフ', () => {
    const chart = playerBarChart(
      'attack',
      [
        set({ setId: 's1', attacks: [attack('p7', 'kill'), attack('p7', 'continue')] }),
        set({ setId: 's2', attacks: [attack('p7', 'kill'), attack('p7', 'error')] }),
      ],
      players,
    )
    expect(chart.series[0]?.values).toEqual([50]) // 得点 2 ÷ 打数 4
    const empty = playerBarChart('reception', [set({})], players)
    expect(empty.labels).toEqual([])
    expect(empty.series[0]?.values).toEqual([])
  })
})

describe('scoreTrendChart（得点の推移の折れ線）', () => {
  const row = (no: number, side: TrendRow['side']): TrendRow => ({
    id: `r${no}`,
    no,
    score: '',
    side,
    text: '',
  })

  it('0-0 から始めて、1点ずつ自チーム・相手の得点を数える', () => {
    // 自・自・相・自 → 自 0,1,2,2,3／相 0,0,0,1,1
    const chart = scoreTrendChart([row(1, 'us'), row(2, 'us'), row(3, 'opp'), row(4, 'us')])
    expect(chart.labels).toEqual(['0', '1', '2', '3', '4'])
    expect(chart.our).toEqual([0, 1, 2, 2, 3])
    expect(chart.opp).toEqual([0, 0, 0, 1, 1])
  })

  it('得点がなければ 0-0 だけ', () => {
    expect(scoreTrendChart([])).toEqual({ labels: ['0'], our: [0], opp: [0] })
  })
})
