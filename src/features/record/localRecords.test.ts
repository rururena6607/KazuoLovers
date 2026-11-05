import { describe, expect, it } from 'vitest'
import type { PointRecord, SetRecords, Side } from '../../contracts/index.ts'
import { overlay, prune } from './localRecords.ts'

const point = (id: string, side: Side, sec: number): PointRecord => ({
  kind: 'point',
  clientId: id,
  setId: 's1',
  side,
  cause: 'manual',
  sourceId: null,
  ourScore: 0,
  oppScore: 0,
  recordedAt: `2026-10-29T10:00:${String(sec).padStart(2, '0')}.000Z`,
})

const setOf = (points: PointRecord[]): SetRecords => ({
  setId: 's1',
  serves: [],
  receptions: [],
  attacks: [],
  points,
})

describe('overlay', () => {
  it('端末で保存した記録を、通知を待たずに時刻順に入れる', () => {
    const a = point('a', 'us', 1)
    const b = point('b', 'opp', 2)
    const sets = overlay([setOf([b])], new Map([['a', a]]))
    expect(sets[0]?.points).toEqual([a, b])
  })

  it('端末で消した記録は出さない', () => {
    const a = point('a', 'us', 1)
    const sets = overlay([setOf([a])], new Map([['a', null]]))
    expect(sets[0]?.points).toEqual([])
  })

  it('同じ clientId は端末の新しいほう（付け足し）を出す', () => {
    const a = point('a', 'us', 1)
    const edited = { ...a, cause: 'ace' as const }
    const sets = overlay([setOf([a])], new Map([['a', edited]]))
    expect(sets[0]?.points).toEqual([edited])
  })
})

describe('prune', () => {
  it('通知に届いた保存と、なくなった削除を外す', () => {
    const a = point('a', 'us', 1)
    const local = new Map([
      ['a', a],
      ['b', null],
    ])
    expect(prune(local, [setOf([a])]).size).toBe(0)
  })

  it('まだ届いていない変更（送信待ちなど）は残す', () => {
    const a = point('a', 'us', 1)
    const local = new Map([['a', a]])
    expect(prune(local, [setOf([])])).toBe(local)
  })
})
