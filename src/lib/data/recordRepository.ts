// RecordRepository の本物（T-14・T-15）。送る先（RemoteRecordStore）と送信待ちの置き場（PendingStore）は
// 差し替えられ、テストでは偽物を渡す。
// 保存と削除は、まず端末の送信待ちに入れて購読している画面にすぐ反映し、そのあとで送る。
// 送れなかったものは送信待ちに残り、次の保存か retry() で送り直す。自動の再送は autoRetry.ts。
// ほかの端末の記録は、送る先の watch（Realtime、T-25）で受け取って反映する。
import type {
  AnyRecord,
  RecordRepository,
  SetRecords,
  Unsubscribe,
} from '../../contracts/index.ts'
import { emptySetRecords } from './recordRows.ts'

/** 記録を送る先。失敗したら reject する */
export interface RemoteRecordStore {
  /** 同じ clientId は上書きする */
  upsert(rec: AnyRecord): Promise<void>
  remove(clientId: string): Promise<void>
  listBySet(setId: string): Promise<SetRecords>
  /** その試合のセットの id を、セットの番号の順に返す */
  listSetIds(matchId: string): Promise<string[]>
  /** ほかの端末の変更を知らせる（T-25、Realtime）。なければ、自分の端末の変更だけを反映する */
  watch?(matchId: string, setIds: readonly string[], changes: RemoteChanges): Unsubscribe
}

export interface RemoteChanges {
  /** その試合のセットの記録が足された・直された */
  onRecord(rec: AnyRecord): void
  /** 記録が消された、セットが増えた、つなぎ直したなど、読み直しが要る */
  onReload(): void
}

/** 送信待ちの操作。同じ clientId は新しい操作で置き換える */
export type PendingOp = { type: 'save'; rec: AnyRecord } | { type: 'remove'; clientId: string }
type Op = PendingOp

export const opClientId = (op: PendingOp) => (op.type === 'save' ? op.rec.clientId : op.clientId)

/** 送信待ちを、再読み込みやアプリを閉じても残す置き場（IndexedDB。pendingStore.ts） */
export interface PendingStore {
  loadAll(): Promise<PendingOp[]>
  /** 同じ clientId は置き換える */
  put(op: PendingOp): Promise<void>
  delete(clientId: string): Promise<void>
}

/** 端末に残さない置き場。テストや、IndexedDB が使えないときに使う */
export const memoryPendingStore = (): PendingStore => ({
  loadAll: async () => [],
  put: async () => {},
  delete: async () => {},
})

interface Subscription {
  matchId: string
  onChange: (sets: SetRecords[]) => void
  /** null：まだ読めていない */
  sets: SetRecords[] | null
  /** 読んでいるあいだの操作。読み終わったら上に重ねる */
  during: Op[] | null
  loading: Promise<void> | null
  /** 読んでいるあいだに読み直しを頼まれた */
  reload: boolean
  /** ほかの端末の変更の受け取りをやめる */
  unwatch: Unsubscribe | null
  /** 受け取っているセットの id（変わったら受け取り直す） */
  watching: string | null
}

const byTime = (a: { recordedAt: string }, b: { recordedAt: string }) =>
  a.recordedAt.localeCompare(b.recordedAt)

const without = <T extends { clientId: string }>(list: T[], clientId: string) =>
  list.filter((r) => r.clientId !== clientId)

/** 操作を1つ重ねた SetRecords を返す。元は変えない。その記録のセットがなければ null */
function applyOp(sets: SetRecords[], op: Op): SetRecords[] | null {
  const clientId = opClientId(op)
  const removed = sets.map((s) => ({
    setId: s.setId,
    serves: without(s.serves, clientId),
    receptions: without(s.receptions, clientId),
    attacks: without(s.attacks, clientId),
    points: without(s.points, clientId),
  }))
  if (op.type === 'remove') return removed
  const rec = op.rec
  const target = removed.find((s) => s.setId === rec.setId)
  if (!target) return null
  switch (rec.kind) {
    case 'serve':
      target.serves = [...target.serves, rec].sort(byTime)
      break
    case 'reception':
      target.receptions = [...target.receptions, rec].sort(byTime)
      break
    case 'attack':
      target.attacks = [...target.attacks, rec].sort(byTime)
      break
    case 'point':
      target.points = [...target.points, rec].sort(byTime)
      break
  }
  return removed
}

/** 端末への保存が失敗しても（容量不足・プライベートブラウズなど）、記録の送信は止めない */
async function keep(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (e) {
    console.warn('送信待ちを端末に残せませんでした', e)
  }
}

export function createRecordRepository(
  remote: RemoteRecordStore,
  store: PendingStore = memoryPendingStore(),
): RecordRepository {
  const pending = new Map<string, Op>()
  const pendingListeners = new Set<(count: number) => void>()
  const subs = new Set<Subscription>()
  let flushing: Promise<void> | null = null
  let again = false

  const notifyPending = () => {
    for (const fn of pendingListeners) fn(pending.size)
  }

  const overlayPending = (sets: SetRecords[]): SetRecords[] => {
    let out = sets
    for (const op of pending.values()) out = applyOp(out, op) ?? out
    return out
  }

  /**
   * その試合のセットと記録を読み、画面に知らせる。読んでいる最中に呼ばれたら、終わってからもう一度読む。
   * op：読んでいるあいだに送り終わっても消えないよう、読んだ結果に重ねる操作
   */
  const load = (sub: Subscription, op?: Op): Promise<void> => {
    if (sub.loading) {
      if (op) sub.during?.push(op)
      sub.reload = true
      return sub.loading
    }
    const during: Op[] = op ? [op] : []
    sub.during = during
    sub.loading = (async () => {
      do {
        sub.reload = false
        try {
          const ids = await remote.listSetIds(sub.matchId)
          const loaded = await Promise.all(ids.map((id) => remote.listBySet(id)))
          let sets = overlayPending(loaded)
          for (const op of during) sets = applyOp(sets, op) ?? sets
          sub.sets = sets
          watch(sub, ids)
        } catch (e) {
          // 読めなかったら空で知らせ、retry() で読み直す
          console.error('記録を読めませんでした', e)
          sub.sets = null
        }
      } while (sub.reload)
      sub.during = null
      sub.loading = null
      if (subs.has(sub)) sub.onChange(sub.sets ?? [])
    })()
    return sub.loading
  }

  /** ほかの端末の変更を受け取る。セットが変わったら受け取り直す */
  const watch = (sub: Subscription, setIds: string[]) => {
    const key = setIds.join(',')
    if (!remote.watch || !subs.has(sub) || sub.watching === key) return
    sub.unwatch?.()
    sub.watching = key
    sub.unwatch = remote.watch(sub.matchId, setIds, {
      onRecord(rec) {
        // 自分の端末で直してまだ送っていない記録は、そちらを新しいものとする（古い版が届いても戻さない）
        if (!subs.has(sub) || pending.has(rec.clientId)) return
        const op: Op = { type: 'save', rec }
        if (sub.during) {
          sub.during.push(op)
          return
        }
        if (!sub.sets) return
        const next = applyOp(sub.sets, op)
        if (next) {
          sub.sets = next
          sub.onChange(next)
        } else {
          void load(sub)
        }
      },
      onReload() {
        if (subs.has(sub)) void load(sub)
      },
    })
  }

  /** 操作を購読している画面に反映する */
  const applyToSubs = (op: Op) => {
    for (const sub of subs) {
      if (sub.during) {
        sub.during.push(op)
        continue
      }
      if (!sub.sets) continue
      const next = applyOp(sub.sets, op)
      if (next) {
        sub.sets = next
        sub.onChange(next)
      } else {
        // 知らないセット（試合の途中で足したセットなど）の記録なので、セットの一覧から読み直す
        void load(sub, op)
      }
    }
  }

  const sendAll = async () => {
    for (const [clientId, op] of [...pending]) {
      try {
        if (op.type === 'save') await remote.upsert(op.rec)
        else await remote.remove(clientId)
        // 送っているあいだに同じ記録が変わっていたら、新しいほうを送信待ちに残す
        if (pending.get(clientId) === op) {
          pending.delete(clientId)
          await keep(() => store.delete(clientId))
        }
      } catch (e) {
        // 1本が送れなくても、ほかの記録は送る。残ったものは送信待ちの件数に出る
        console.error('記録を送れませんでした', clientId, e)
      }
    }
    notifyPending()
  }

  /** 送信待ちを送る。送っている最中に呼ばれたら、終わってからもう一度送る */
  const flush = (): Promise<void> => {
    if (flushing) {
      again = true
      return flushing
    }
    flushing = (async () => {
      do {
        again = false
        await sendAll()
      } while (again)
      flushing = null
    })()
    return flushing
  }

  /** 戻し終わるまでに保存・削除した記録。送り終わって送信待ちから消えても、古いものを戻さない */
  let touchedBeforeRestore: Set<string> | null = new Set()

  const enqueue = async (clientId: string, op: Op) => {
    touchedBeforeRestore?.add(clientId)
    pending.set(clientId, op)
    notifyPending()
    applyToSubs(op)
    // 送る前に端末に残す。送っている途中でアプリが閉じても、次に開いたときに送り直せる
    await keep(() => store.put(op))
    await flush()
  }

  // 前に開いたときの送信待ちを戻して送る。戻すあいだに保存された記録は、そちらを新しいものとする
  const restoring = (async () => {
    let ops: PendingOp[] = []
    await keep(async () => {
      ops = await store.loadAll()
    })
    const touched = touchedBeforeRestore ?? new Set<string>()
    touchedBeforeRestore = null
    const restored = ops.filter((op) => !touched.has(opClientId(op)))
    if (restored.length === 0) return
    for (const op of restored) {
      pending.set(opClientId(op), op)
      applyToSubs(op)
    }
    notifyPending()
    await flush()
  })()

  return {
    save(rec) {
      return enqueue(rec.clientId, { type: 'save', rec })
    },
    remove(clientId) {
      return enqueue(clientId, { type: 'remove', clientId })
    },
    async listBySet(setId) {
      return overlayPending([await remote.listBySet(setId)])[0] ?? emptySetRecords(setId)
    },
    subscribe(matchId, onChange): Unsubscribe {
      const sub: Subscription = {
        matchId,
        onChange,
        sets: null,
        during: null,
        loading: null,
        reload: false,
        unwatch: null,
        watching: null,
      }
      subs.add(sub)
      void load(sub)
      return () => {
        subs.delete(sub)
        sub.unwatch?.()
        sub.unwatch = null
      }
    },
    subscribePending(onChange): Unsubscribe {
      pendingListeners.add(onChange)
      onChange(pending.size)
      return () => pendingListeners.delete(onChange)
    },
    async retry() {
      await restoring
      await flush()
      await Promise.all([...subs].filter((s) => !s.sets && !s.loading).map((s) => load(s)))
    },
  }
}
