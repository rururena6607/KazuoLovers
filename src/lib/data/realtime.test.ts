// ほかの端末の記録の反映（T-25）。Realtime の代わりに、偽物の watch から変更を流す。
import { describe, expect, it } from 'vitest'
import type { AnyRecord, PointRecord, SetRecords } from '../../contracts/index.ts'
import { createRecordRepository, type RemoteChanges, type RemoteRecordStore } from './recordRepository.ts'
import { emptySetRecords, recordFromRow, toRow } from './recordRows.ts'

const point = (clientId: string, ourScore: number, setId = 's1'): PointRecord => ({
  kind: 'point',
  clientId,
  setId,
  side: 'us',
  cause: 'manual',
  sourceId: null,
  ourScore,
  oppScore: 0,
  recordedAt: `2026-10-29T10:00:${String(ourScore).padStart(2, '0')}.000Z`,
})

/** 2台の端末が使う、1つのデータベースの代わり */
function createServer(setIds: string[]) {
  const rows = new Map<string, AnyRecord>()
  const watchers = new Set<{ setIds: readonly string[]; changes: RemoteChanges }>()
  const state = { setIds, online: true, upsertDelay: Promise.resolve() }
  const remote: RemoteRecordStore = {
    async upsert(rec) {
      await state.upsertDelay
      if (!state.online) throw new Error('Failed to fetch')
      rows.set(rec.clientId, rec)
      for (const w of watchers) if (w.setIds.includes(rec.setId)) w.changes.onRecord(rec)
    },
    async remove(clientId) {
      rows.delete(clientId)
      for (const w of watchers) w.changes.onReload()
    },
    async listBySet(setId) {
      const out = emptySetRecords(setId)
      for (const r of rows.values()) if (r.kind === 'point' && r.setId === setId) out.points.push(r)
      return out
    },
    async listSetIds() {
      return state.setIds
    },
    watch(_matchId, ids, changes) {
      const w = { setIds: ids, changes }
      watchers.add(w)
      return () => watchers.delete(w)
    },
  }
  return { remote, rows, watchers, state }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

async function open(remote: RemoteRecordStore) {
  const repo = createRecordRepository(remote)
  const calls: SetRecords[][] = []
  const stop = repo.subscribe('m1', (sets) => calls.push(sets))
  await tick()
  const points = (i = 0) => calls.at(-1)?.[i]?.points.map((p) => `${p.clientId}:${p.ourScore}`)
  return { repo, calls, stop, points }
}

describe('ほかの端末の記録の反映', () => {
  it('ほかの端末で保存した記録が、読み直さずに出る', async () => {
    const server = createServer(['s1'])
    const a = await open(server.remote)
    const b = await open(server.remote)
    await a.repo.save(point('p1', 1))
    expect(b.points()).toEqual(['p1:1'])
  })

  it('自分の端末で直してまだ送っていない記録は、ほかから届いた古い版で戻さない', async () => {
    const server = createServer(['s1'])
    const a = await open(server.remote)
    const b = await open(server.remote)
    await a.repo.save(point('p1', 1))

    // b で直す（まだ送れていない）あいだに、a の古い版がもう一度届く
    let release = () => {}
    server.state.upsertDelay = new Promise<void>((r) => (release = r))
    const saving = b.repo.save({ ...point('p1', 1), ourScore: 9 })
    for (const w of server.watchers) w.changes.onRecord(point('p1', 1))
    expect(b.points()).toEqual(['p1:9'])
    release()
    await saving
    expect(a.points()).toEqual(['p1:9'])
  })

  it('ほかの端末で消したら読み直す', async () => {
    const server = createServer(['s1'])
    const a = await open(server.remote)
    const b = await open(server.remote)
    await a.repo.save(point('p1', 1))
    await a.repo.remove('p1')
    await tick()
    expect(b.points()).toEqual([])
  })

  it('セットが増えて読み直したら、新しいセットの記録も受け取る', async () => {
    const server = createServer(['s1'])
    const b = await open(server.remote)
    expect([...server.watchers].map((w) => w.setIds)).toEqual([['s1']])

    server.state.setIds = ['s1', 's2']
    for (const w of server.watchers) w.changes.onReload()
    await tick()
    expect([...server.watchers].map((w) => w.setIds)).toEqual([['s1', 's2']])

    const a = createRecordRepository(server.remote)
    await a.save(point('p2', 1, 's2'))
    expect(b.points(1)).toEqual(['p2:1'])
  })

  it('購読をやめると、受け取りもやめる', async () => {
    const server = createServer(['s1'])
    const b = await open(server.remote)
    expect(server.watchers.size).toBe(1)
    b.stop()
    expect(server.watchers.size).toBe(0)
  })
})

describe('recordFromRow', () => {
  it('Realtime で届いた行を、テーブルに合わせて記録に戻す', () => {
    const rec = point('p1', 3)
    const { table, row } = toRow(rec)
    expect(recordFromRow(table, row)).toEqual(rec)
  })
})
