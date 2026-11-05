import { describe, expect, it } from 'vitest'
import type { Player, ServeRecord } from '../../contracts/index.ts'
import { RECENT_SERVE_MARKS, recentServeMarks } from './recentMarks.ts'

const player = (id: string, number: number): Player => ({
  id,
  teamId: 't',
  number,
  name: id,
  position: null,
  serveType: 'float',
  active: true,
})
const players = [player('p7', 7), player('p3', 3)]
const colors = new Map([
  ['p7', '#111111'],
  ['p3', '#222222'],
])

/** n 秒目のサーブ。toX が null ならネット（着弾点なし） */
const serve = (n: number, serverId: string, toX: number | null = 0.5): ServeRecord => ({
  kind: 'serve',
  clientId: `s${n}`,
  setId: 'set1',
  serverId,
  serveType: 'float',
  fromX: null,
  toX,
  toY: toX === null ? null : 0.5,
  result: toX === null ? 'miss' : 'in',
  missType: toX === null ? 'net' : null,
  reception: toX === null ? null : 'B',
  receiverId: null,
  targetZone: null,
  recordedAt: `2026-11-05T10:00:${String(n).padStart(2, '0')}Z`,
})

describe('recentServeMarks', () => {
  it('着弾点のある直前の5本を古い順に、選手の色と背番号で返す', () => {
    const serves = [1, 2, 3, 4, 5, 6, 7].map((n) => serve(n, n % 2 ? 'p7' : 'p3'))
    const marks = recentServeMarks(serves, players, colors)
    expect(RECENT_SERVE_MARKS).toBe(5)
    expect(marks).toHaveLength(5)
    // 3〜7 秒目の5本。奇数秒は p7（#7）、偶数秒は p3（#3）
    expect(marks.map((m) => m.label)).toEqual(['7', '3', '7', '3', '7'])
    expect(marks[0]?.color).toBe('#111111')
    expect(marks[1]?.color).toBe('#222222')
  })
  it('記録の順番がばらばらでも、記録した時刻の順に並べる', () => {
    const marks = recentServeMarks([serve(3, 'p7'), serve(1, 'p3'), serve(2, 'p7')], players, colors)
    expect(marks.map((m) => m.label)).toEqual(['3', '7', '7'])
  })
  it('ネット（着弾点なし）は数えない', () => {
    const marks = recentServeMarks([serve(1, 'p7'), serve(2, 'p3', null)], players, colors)
    expect(marks.map((m) => m.label)).toEqual(['7'])
  })
  it('チームにいない選手のサーブは出さない', () => {
    expect(recentServeMarks([serve(1, 'ghost')], players, colors)).toEqual([])
  })
})
