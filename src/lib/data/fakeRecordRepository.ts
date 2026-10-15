// 画面を作るあいだに使う、メモリ上だけの RecordRepository（実装計画書 3.1）。
// setOnline(false) にすると保存が送信待ちになり、未送信の表示を試せる。
import type {
  AnyRecord,
  RecordRepository,
  SetRecords,
  Unsubscribe,
} from '../../contracts/index.ts'

export interface FakeRecordRepository extends RecordRepository {
  /** false のあいだは保存を送信待ちにする。true に戻すと送る */
  setOnline(online: boolean): void
}

/** setsByMatch：試合の id → その試合のセットの id の一覧 */
export function createFakeRecordRepository(
  setsByMatch: Record<string, readonly string[]>,
): FakeRecordRepository {
  const saved = new Map<string, AnyRecord>()
  const pending = new Map<string, AnyRecord>()
  const matchListeners = new Map<string, Set<(sets: SetRecords[]) => void>>()
  const pendingListeners = new Set<(count: number) => void>()
  let online = true

  const collect = (setId: string): SetRecords => {
    const out: SetRecords = { setId, serves: [], receptions: [], attacks: [], points: [] }
    for (const rec of saved.values()) {
      if (rec.setId !== setId) continue
      switch (rec.kind) {
        case 'serve':
          out.serves.push(rec)
          break
        case 'reception':
          out.receptions.push(rec)
          break
        case 'attack':
          out.attacks.push(rec)
          break
        case 'point':
          out.points.push(rec)
          break
      }
    }
    const byTime = (a: { recordedAt: string }, b: { recordedAt: string }) =>
      a.recordedAt.localeCompare(b.recordedAt)
    out.serves.sort(byTime)
    out.receptions.sort(byTime)
    out.attacks.sort(byTime)
    out.points.sort(byTime)
    return out
  }

  const notify = () => {
    for (const [matchId, listeners] of matchListeners) {
      const sets = (setsByMatch[matchId] ?? []).map(collect)
      for (const fn of listeners) fn(sets)
    }
    for (const fn of pendingListeners) fn(pending.size)
  }

  const flush = () => {
    for (const [id, rec] of pending) saved.set(id, rec)
    pending.clear()
  }

  return {
    async save(rec) {
      if (online) saved.set(rec.clientId, rec)
      else pending.set(rec.clientId, rec)
      notify()
    },
    async remove(clientId) {
      saved.delete(clientId)
      pending.delete(clientId)
      notify()
    },
    async listBySet(setId) {
      return collect(setId)
    },
    subscribe(matchId, onChange): Unsubscribe {
      const listeners = matchListeners.get(matchId) ?? new Set()
      listeners.add(onChange)
      matchListeners.set(matchId, listeners)
      onChange((setsByMatch[matchId] ?? []).map(collect))
      return () => listeners.delete(onChange)
    },
    subscribePending(onChange): Unsubscribe {
      pendingListeners.add(onChange)
      onChange(pending.size)
      return () => pendingListeners.delete(onChange)
    },
    async retry() {
      if (!online) return
      flush()
      notify()
    },
    setOnline(next) {
      online = next
      if (online) flush()
      notify()
    },
  }
}
