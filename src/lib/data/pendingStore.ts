// 送信待ちを IndexedDB に残す PendingStore（T-15）。再読み込みやアプリを閉じても、未送信の記録が消えない。
// IndexedDB が使えない環境（テスト、古いブラウザ）では、端末に残さない置き場にする。
import { memoryPendingStore, opClientId, type PendingOp, type PendingStore } from './recordRepository.ts'

const DB_NAME = 'kazuolovers'
const DB_VERSION = 1
const STORE = 'pending'

/** IDBRequest を Promise にする */
const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

export function createIndexedDbPendingStore(): PendingStore {
  if (typeof indexedDB === 'undefined') return memoryPendingStore()

  let opening: Promise<IDBDatabase> | null = null
  const open = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      // 送信待ちは clientId を鍵にして、同じ記録は置き換える
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        opening = null
        reject(req.error)
      }
    })
    return opening
  }

  const withStore = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open()
    return done(fn(db.transaction(STORE, mode).objectStore(STORE)))
  }

  return {
    async loadAll() {
      const values: unknown[] = await withStore('readonly', (s) => s.getAll())
      return values.filter(isPendingOp)
    },
    async put(op) {
      await withStore('readwrite', (s) => s.put(op, opClientId(op)))
    },
    async delete(clientId) {
      await withStore('readwrite', (s) => s.delete(clientId))
    },
  }
}

/** 前の版のアプリが残したものなど、形の違うものは読まない */
function isPendingOp(v: unknown): v is PendingOp {
  if (typeof v !== 'object' || v === null) return false
  const op = v as Record<string, unknown>
  if (op.type === 'remove') return typeof op.clientId === 'string'
  if (op.type !== 'save' || typeof op.rec !== 'object' || op.rec === null) return false
  const rec = op.rec as Record<string, unknown>
  return (
    typeof rec.clientId === 'string' &&
    typeof rec.setId === 'string' &&
    ['serve', 'reception', 'attack', 'point'].includes(String(rec.kind))
  )
}
