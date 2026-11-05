import { describe, expect, it } from 'vitest'
import type { ReceptionRecord, ServeRecord } from '../../contracts/index.ts'
import { zoneOf } from '../court/index.ts'
import { receptionPositionShare, serveLandingShare } from './course.ts'

const serve = (toX: number | null, toY: number | null): ServeRecord => ({
  kind: 'serve',
  clientId: 'c',
  setId: 's1',
  serverId: 'p1',
  serveType: 'float',
  fromX: 0.5,
  toX,
  toY,
  result: 'in',
  missType: null,
  reception: 'A',
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-11-05T00:00:00Z',
})
const reception = (atX: number | null, atY: number | null, result: ReceptionRecord['result'] = 'A'): ReceptionRecord => ({
  kind: 'reception',
  clientId: 'c',
  setId: 's1',
  receiverId: result === 'opp_miss' ? null : 'p1',
  oppServerId: null,
  oppServeType: null,
  atX,
  atY,
  result,
  recordedAt: '2026-11-05T00:00:00Z',
})
const times = <T,>(n: number, make: () => T): T[] => Array.from({ length: n }, make)

// 手計算：相手コートの奥の列（y=0.5）は x=0.1→ゾーン1、0.5→6、0.9→5。ネット側の列（y=0.1）は x=0.1→2、0.5→3、0.9→4
describe('serveLandingShare（着弾ゾーン割合）', () => {
  const serves = [
    ...times(4, () => serve(0.1, 0.5)), // ゾーン1：4 本
    ...times(2, () => serve(0.1, 0.1)), // ゾーン2：2 本
    serve(0.9, 0.5), // ゾーン5：1 本
    serve(0.5, 1.2), // アウト（エンドラインの外）。座標があるので分母に入る
    ...times(2, () => serve(null, null)), // ネット。着弾点なしなので分母に入らない
  ]
  const { total, zones } = serveLandingShare(serves, zoneOf)

  it('分母は着弾点のあるサーブ（アウトを含み、ネットを除く）：4+2+1+1 = 8', () => {
    expect(total).toBe(8)
  })

  it('割合 = ゾーンの本数 ÷ 8 × 100', () => {
    expect(zones.get(1)).toEqual({ count: 4, share: 50 }) // 4/8
    expect(zones.get(2)).toEqual({ count: 2, share: 25 }) // 2/8
    expect(zones.get(5)).toEqual({ count: 1, share: 12.5 }) // 1/8
  })

  it('0 本のゾーンも番号順に返し、割合は 0%', () => {
    expect([...zones.keys()]).toEqual([1, 2, 3, 4, 5, 6])
    expect(zones.get(3)).toEqual({ count: 0, share: 0 })
  })

  it('アウトがあるので、ゾーンの割合を足しても 100% にならない（87.5%）', () => {
    const sum = [...zones.values()].reduce((n, z) => n + (z.share ?? 0), 0)
    expect(sum).toBe(87.5)
  })

  it('着弾点のあるサーブが 0 本なら、割合は null', () => {
    const empty = serveLandingShare([serve(null, null)], zoneOf)
    expect(empty.total).toBe(0)
    expect(empty.zones.get(1)).toEqual({ count: 0, share: null })
    expect(serveLandingShare([], zoneOf).zones.size).toBe(6)
  })
})

// 自コートの奥の列（y=0.5）は x=0.1→ゾーン5、0.5→6、0.9→1。ネット側の列（y=0.1）は x=0.1→4、0.5→3、0.9→2
describe('receptionPositionShare（受けた位置の割合）', () => {
  const receptions = [
    ...times(3, () => reception(0.5, 0.5)), // ゾーン6：3 本
    reception(0.9, 0.5, 'B'), // ゾーン1：1 本
    ...times(2, () => reception(null, null)), // 位置を入れなかったレシーブ
    reception(null, null, 'opp_miss'), // 相手ミス（誰も受けていない）
  ]
  const { total, zones } = receptionPositionShare(receptions, zoneOf)

  it('分母は位置のあるレシーブ：3+1 = 4（位置なし・相手ミスは入れない）', () => {
    expect(total).toBe(4)
  })

  it('割合 = ゾーンの本数 ÷ 4 × 100', () => {
    expect(zones.get(6)).toEqual({ count: 3, share: 75 }) // 3/4
    expect(zones.get(1)).toEqual({ count: 1, share: 25 }) // 1/4
    expect(zones.get(4)).toEqual({ count: 0, share: 0 })
  })

  it('位置のあるレシーブが 0 本なら、割合は null', () => {
    expect(receptionPositionShare([reception(null, null)], zoneOf).zones.get(6)?.share).toBeNull()
  })
})
