// RecordRepository の本物（T-14）。送る先（RemoteRecordStore）は差し替えられ、テストでは偽物を渡す。
// 保存と削除は、まず端末の送信待ちに入れて購読している画面にすぐ反映し、そのあとで送る。
// 送れなかったものは送信待ちに残り、次の保存か retry() で送り直す。
// 送信待ちを IndexedDB に保つこと、自動の再送は T-15 で足す。
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
}

/** 送信待ちの操作。同じ clientId は新しい操作で置き換える */
type Op = { type: 'save'; rec: AnyRecord } | { type: 'remove'; clientId: string }

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
}

const byTime = (a: { recordedAt: string }, b: { recordedAt: string }) =>
  a.recordedAt.localeCompare(b.recordedAt)

const without = <T extends { clientId: string }>(list: T[], clientId: string) =>
  list.filter((r) => r.clientId !== clientId)

/** 操作を1つ重ねた SetRecords を返す。元は変えない。その記録のセットがなければ null */
function applyOp(sets: SetRecords[], op: Op): SetRecords[] | null {
  const clientId = op.type === 'save' ? op.rec.clientId : op.clientId
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

export function createRecordRepository(remote: RemoteRecordStore): RecordRepository {
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
        if (pending.get(clientId) === op) pending.delete(clientId)
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

  const enqueue = (clientId: string, op: Op) => {
    pending.set(clientId, op)
    notifyPending()
    applyToSubs(op)
    return flush()
  }

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
      }
      subs.add(sub)
      void load(sub)
      return () => subs.delete(sub)
    },
    subscribePending(onChange): Unsubscribe {
      pendingListeners.add(onChange)
      onChange(pending.size)
      return () => pendingListeners.delete(onChange)
    },
    async retry() {
      await flush()
      await Promise.all([...subs].filter((s) => !s.sets && !s.loading).map((s) => load(s)))
    },
  }
}
