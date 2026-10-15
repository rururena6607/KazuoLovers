import { describe, expect, it } from 'vitest'
import type { PointRecord, ServeRecord, SetRecords } from '../../contracts/index.ts'
import { createFakeRecordRepository } from './fakeRecordRepository.ts'

const serve = (clientId: string, recordedAt: string): ServeRecord => ({
  kind: 'serve',
  clientId,
  setId: 's1',
  serverId: 'p7',
  serveType: 'float',
  fromX: 0.5,
  toX: 0.2,
  toY: 0.8,
  result: 'in',
  missType: null,
  reception: 'C',
  receiverId: null,
  targetZone: null,
  recordedAt,
})

const point: PointRecord = {
  kind: 'point',
  clientId: 'pt1',
  setId: 's1',
  side: 'us',
  cause: 'manual',
  sourceId: null,
  ourScore: 1,
  oppScore: 0,
  recordedAt: '2026-10-15T10:00:05Z',
}

describe('createFakeRecordRepository', () => {
  it('種類ごとに分け、時刻の順に並べて返す', async () => {
    const repo = createFakeRecordRepository({ m1: ['s1'] })
    await repo.save(serve('b', '2026-10-15T10:00:02Z'))
    await repo.save(serve('a', '2026-10-15T10:00:01Z'))
    await repo.save(point)
    const recs = await repo.listBySet('s1')
    expect(recs.serves.map((r) => r.clientId)).toEqual(['a', 'b'])
    expect(recs.points).toHaveLength(1)
  })

  it('同じ clientId は上書きする', async () => {
    const repo = createFakeRecordRepository({ m1: ['s1'] })
    await repo.save(serve('a', '2026-10-15T10:00:01Z'))
    await repo.save({ ...serve('a', '2026-10-15T10:00:01Z'), reception: 'D' })
    const recs = await repo.listBySet('s1')
    expect(recs.serves).toHaveLength(1)
    expect(recs.serves[0]?.reception).toBe('D')
  })

  it('オフラインのあいだは送信待ちになり、オンラインに戻すと保存される', async () => {
    const repo = createFakeRecordRepository({ m1: ['s1'] })
    const counts: number[] = []
    repo.subscribePending((n) => counts.push(n))
    repo.setOnline(false)
    await repo.save(serve('a', '2026-10-15T10:00:01Z'))
    expect((await repo.listBySet('s1')).serves).toHaveLength(0)
    repo.setOnline(true)
    expect((await repo.listBySet('s1')).serves).toHaveLength(1)
    expect(counts.at(-1)).toBe(0)
    expect(counts).toContain(1)
  })

  it('購読すると、登録した直後と変わるたびに呼ばれ、解除すると呼ばれない', async () => {
    const repo = createFakeRecordRepository({ m1: ['s1'] })
    const calls: SetRecords[][] = []
    const stop = repo.subscribe('m1', (sets) => calls.push(sets))
    await repo.save(serve('a', '2026-10-15T10:00:01Z'))
    stop()
    await repo.remove('a')
    expect(calls).toHaveLength(2)
    expect(calls[1]?.[0]?.serves).toHaveLength(1)
  })
})
