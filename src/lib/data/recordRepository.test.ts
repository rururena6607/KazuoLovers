import { describe, expect, it } from 'vitest'
import type { AnyRecord, PointRecord, ServeRecord, SetRecords } from '../../contracts/index.ts'
import { createRecordRepository, type RemoteRecordStore } from './recordRepository.ts'
import { emptySetRecords } from './recordRows.ts'

const serve = (clientId: string, recordedAt: string, setId = 's1'): ServeRecord => ({
  kind: 'serve',
  clientId,
  setId,
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

const point = (clientId: string, ourScore: number): PointRecord => ({
  kind: 'point',
  clientId,
  setId: 's1',
  side: 'us',
  cause: 'manual',
  sourceId: null,
  ourScore,
  oppScore: 0,
  recordedAt: `2026-10-15T10:00:0${ourScore}.000Z`,
})

/** メモリ上の送る先。online を false にすると、すべて失敗する */
function createFakeRemote(setsByMatch: Record<string, string[]>) {
  const rows = new Map<string, AnyRecord>()
  const sent: string[] = []
  const state = { online: true }
  const fail = () => {
    if (!state.online) throw new Error('Failed to fetch')
  }
  const remote: RemoteRecordStore = {
    async upsert(rec) {
      fail()
      sent.push(rec.clientId)
      rows.set(rec.clientId, rec)
    },
    async remove(clientId) {
      fail()
      rows.delete(clientId)
    },
    async listBySet(setId) {
      fail()
      const out = emptySetRecords(setId)
      for (const r of rows.values()) {
        if (r.setId !== setId) continue
        if (r.kind === 'serve') out.serves.push(r)
        if (r.kind === 'point') out.points.push(r)
      }
      return out
    },
    async listSetIds(matchId) {
      fail()
      return setsByMatch[matchId] ?? []
    },
  }
  return { remote, rows, sent, state, setsByMatch }
}

/** 購読して、知らされた値をためる。最初の読み込みが終わるまで待つ */
async function watch(repo: ReturnType<typeof createRecordRepository>, matchId: string) {
  const calls: SetRecords[][] = []
  const stop = repo.subscribe(matchId, (sets) => calls.push(sets))
  await new Promise((r) => setTimeout(r, 0))
  return { calls, stop, last: () => calls.at(-1) ?? [] }
}

describe('createRecordRepository', () => {
  it('保存すると送り、listBySet で読める。同じ clientId は上書きする', async () => {
    const fake = createFakeRemote({ m1: ['s1'] })
    const repo = createRecordRepository(fake.remote)
    await repo.save(serve('a', '2026-10-15T10:00:01.000Z'))
    await repo.save({ ...serve('a', '2026-10-15T10:00:01.000Z'), reception: 'D' })
    const recs = await repo.listBySet('s1')
    expect(recs.serves).toHaveLength(1)
    expect(recs.serves[0]?.reception).toBe('D')
  })

  it('購読すると、読み込んだあとと、保存・削除のたびにすぐ知らせる', async () => {
    const fake = createFakeRemote({ m1: ['s1', 's2'] })
    fake.rows.set('old', serve('old', '2026-10-15T09:59:00.000Z'))
    const repo = createRecordRepository(fake.remote)
    const w = await watch(repo, 'm1')
    expect(w.last().map((s) => s.setId)).toEqual(['s1', 's2'])
    expect(w.last()[0]?.serves.map((r) => r.clientId)).toEqual(['old'])

    const saving = repo.save(serve('a', '2026-10-15T10:00:01.000Z'))
    // 送り終わるのを待たずに反映する
    expect(w.last()[0]?.serves.map((r) => r.clientId)).toEqual(['old', 'a'])
    await saving
    await repo.remove('old')
    expect(w.last()[0]?.serves.map((r) => r.clientId)).toEqual(['a'])

    w.stop()
    await repo.save(serve('b', '2026-10-15T10:00:02.000Z'))
    expect(w.last()[0]?.serves.map((r) => r.clientId)).toEqual(['a'])
  })

  it('送れないあいだは送信待ちに残し、画面には出す。retry で送る', async () => {
    const fake = createFakeRemote({ m1: ['s1'] })
    const repo = createRecordRepository(fake.remote)
    const counts: number[] = []
    repo.subscribePending((n) => counts.push(n))
    const w = await watch(repo, 'm1')

    fake.state.online = false
    await repo.save(point('p1', 1))
    await repo.save(point('p2', 2))
    expect(counts.at(-1)).toBe(2)
    expect(w.last()[0]?.points.map((p) => p.ourScore)).toEqual([1, 2])
    expect(fake.rows.size).toBe(0)

    fake.state.online = true
    await repo.retry()
    expect(counts.at(-1)).toBe(0)
    expect([...fake.rows.keys()]).toEqual(['p1', 'p2'])
  })

  it('送れないあいだに保存してから消した記録は、送らない', async () => {
    const fake = createFakeRemote({ m1: ['s1'] })
    const repo = createRecordRepository(fake.remote)
    fake.state.online = false
    await repo.save(point('p1', 1))
    await repo.remove('p1')
    fake.state.online = true
    await repo.retry()
    expect(fake.sent).toEqual([])
    expect(fake.rows.size).toBe(0)
  })

  it('送っている最中に同じ記録を直したら、新しいほうも送る', async () => {
    const fake = createFakeRemote({ m1: ['s1'] })
    const repo = createRecordRepository(fake.remote)
    const first = repo.save(point('p1', 1))
    const second = repo.save({ ...point('p1', 1), ourScore: 9 })
    await Promise.all([first, second])
    expect(fake.rows.get('p1')).toMatchObject({ ourScore: 9 })
  })

  it('読み込めないと空で知らせ、retry で読み直す。送信待ちの記録も重ねる', async () => {
    const fake = createFakeRemote({ m1: ['s1'] })
    fake.state.online = false
    const repo = createRecordRepository(fake.remote)
    const w = await watch(repo, 'm1')
    expect(w.last()).toEqual([])

    await repo.save(point('p1', 1))
    fake.state.online = true
    await repo.retry()
    expect(w.last()[0]?.points.map((p) => p.clientId)).toEqual(['p1'])
  })

  it('知らないセットの記録を保存したら、セットの一覧から読み直す', async () => {
    const fake = createFakeRemote({ m1: ['s1'] })
    const repo = createRecordRepository(fake.remote)
    const w = await watch(repo, 'm1')
    // 試合の途中で第2セットを作った
    fake.setsByMatch.m1 = ['s1', 's2']
    await repo.save(serve('a', '2026-10-15T10:00:01.000Z', 's2'))
    await new Promise((r) => setTimeout(r, 0))
    expect(w.last().map((s) => s.setId)).toEqual(['s1', 's2'])
    expect(w.last()[1]?.serves.map((r) => r.clientId)).toEqual(['a'])
  })

  it('読み込んでいる最中に保存して送り終わった記録も、読み込みのあとに残る', async () => {
    const fake = createFakeRemote({ m1: ['s1'] })
    // 記録を読んだ（p1 はまだない）あと、release を呼ぶまで返さない
    let release = () => {}
    const gate = new Promise<void>((r) => (release = r))
    let read = () => {}
    const readDone = new Promise<void>((r) => (read = r))
    const listBySet = fake.remote.listBySet
    fake.remote.listBySet = async (setId) => {
      const result = await listBySet(setId)
      read()
      await gate
      return result
    }
    const repo = createRecordRepository(fake.remote)
    const calls: SetRecords[][] = []
    repo.subscribe('m1', (sets) => calls.push(sets))

    await readDone
    await repo.save(point('p1', 1))
    expect(fake.rows.has('p1')).toBe(true)
    release()
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.at(-1)?.[0]?.points.map((p) => p.clientId)).toEqual(['p1'])
  })
})
