// 送信待ちを端末に残す動き（T-15）。IndexedDB の代わりに、メモリ上の PendingStore を使う。
import { describe, expect, it } from 'vitest'
import type { AnyRecord, PointRecord, SetRecords } from '../../contracts/index.ts'
import {
  createRecordRepository,
  opClientId,
  type PendingOp,
  type PendingStore,
  type RemoteRecordStore,
} from './recordRepository.ts'
import { emptySetRecords } from './recordRows.ts'

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

/** 再読み込みしても残る置き場の代わり。2つの repo で同じものを使うと、アプリを開き直したことになる */
function createMapStore() {
  const data = new Map<string, PendingOp>()
  const store: PendingStore = {
    loadAll: async () => [...data.values()],
    put: async (op) => void data.set(opClientId(op), op),
    delete: async (clientId) => void data.delete(clientId),
  }
  return { store, data }
}

function createRemote() {
  const rows = new Map<string, AnyRecord>()
  const state = { online: true }
  const remote: RemoteRecordStore = {
    async upsert(rec) {
      if (!state.online) throw new Error('Failed to fetch')
      rows.set(rec.clientId, rec)
    },
    async remove(clientId) {
      if (!state.online) throw new Error('Failed to fetch')
      rows.delete(clientId)
    },
    async listBySet(setId) {
      if (!state.online) throw new Error('Failed to fetch')
      const out = emptySetRecords(setId)
      for (const r of rows.values()) if (r.kind === 'point' && r.setId === setId) out.points.push(r)
      return out
    },
    async listSetIds() {
      if (!state.online) throw new Error('Failed to fetch')
      return ['s1']
    },
  }
  return { remote, rows, state }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('送信待ちを端末に残す', () => {
  it('送れなかった記録は端末に残り、開き直すと戻って送られる', async () => {
    const { store, data } = createMapStore()
    const net = createRemote()
    net.state.online = false
    const first = createRecordRepository(net.remote, store)
    await first.save(point('p1', 1))
    await first.save(point('p2', 2))
    expect([...data.keys()]).toEqual(['p1', 'p2'])

    // アプリを開き直す。まだ電波がない
    const second = createRecordRepository(net.remote, store)
    const counts: number[] = []
    second.subscribePending((n) => counts.push(n))
    await tick()
    expect(counts.at(-1)).toBe(2)

    net.state.online = true
    await second.retry()
    expect([...net.rows.keys()]).toEqual(['p1', 'p2'])
    expect(counts.at(-1)).toBe(0)
    expect(data.size).toBe(0)
  })

  it('送れた記録は端末から消える。送る前に消した記録も、消す操作として残す', async () => {
    const { store, data } = createMapStore()
    const net = createRemote()
    const repo = createRecordRepository(net.remote, store)
    await repo.save(point('p1', 1))
    expect(data.size).toBe(0)

    net.state.online = false
    await repo.remove('p1')
    expect(data.get('p1')).toEqual({ type: 'remove', clientId: 'p1' })
    net.state.online = true
    await repo.retry()
    expect(net.rows.size).toBe(0)
    expect(data.size).toBe(0)
  })

  it('戻した送信待ちの記録も、購読している画面に出す', async () => {
    const { store } = createMapStore()
    const net = createRemote()
    net.state.online = false
    await createRecordRepository(net.remote, store).save(point('p1', 1))

    net.state.online = true
    // 送り直す前に画面を開く（読み込みは通る）
    const original = net.remote.upsert
    net.remote.upsert = async () => {
      throw new Error('Failed to fetch')
    }
    const repo = createRecordRepository(net.remote, store)
    const calls: SetRecords[][] = []
    repo.subscribe('m1', (sets) => calls.push(sets))
    await tick()
    await tick()
    expect(calls.at(-1)?.[0]?.points.map((p) => p.clientId)).toEqual(['p1'])
    net.remote.upsert = original
  })

  it('戻しているあいだに同じ記録を直したら、新しいほうを残す（二重にも古くもしない）', async () => {
    const { store, data } = createMapStore()
    data.set('p1', { type: 'save', rec: point('p1', 1) })
    const net = createRemote()
    // loadAll が古い p1 を読んだあと、返す前に保存する
    let release = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const loadAll = store.loadAll
    store.loadAll = async () => {
      const ops = await loadAll()
      await gate
      return ops
    }
    const repo = createRecordRepository(net.remote, store)
    await repo.save({ ...point('p1', 1), ourScore: 9 })
    release()
    await repo.retry()
    expect(net.rows.get('p1')).toMatchObject({ ourScore: 9 })
    expect(data.size).toBe(0)
  })

  it('端末に残せなくても（容量不足など）、記録は送る', async () => {
    const net = createRemote()
    const broken: PendingStore = {
      loadAll: async () => {
        throw new Error('QuotaExceededError')
      },
      put: async () => {
        throw new Error('QuotaExceededError')
      },
      delete: async () => {
        throw new Error('QuotaExceededError')
      },
    }
    const repo = createRecordRepository(net.remote, broken)
    await repo.save(point('p1', 1))
    expect(net.rows.has('p1')).toBe(true)
  })
})
