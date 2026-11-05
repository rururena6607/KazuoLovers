import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AnyRecord, RecordRepository, SetRecords } from '../../contracts/index.ts'
import { overlay, prune, type LocalChanges } from './localRecords.ts'

// 試合の記録の購読と、保存・削除。保存した記録は通知を待たずに画面へ出す（localRecords.ts）。

export function useMatchRecords(
  repo: RecordRepository,
  matchId: string,
  onError: (e: unknown) => void,
) {
  const [remote, setRemote] = useState<SetRecords[]>([])
  const [local, setLocal] = useState<LocalChanges>(new Map())

  useEffect(
    () =>
      repo.subscribe(matchId, (sets) => {
        setRemote(sets)
        setLocal((l) => prune(l, sets))
      }),
    [repo, matchId],
  )

  const sets = useMemo(() => overlay(remote, local), [remote, local])

  /** 失敗したら、画面に出した変更を戻す */
  const undoLocal = useCallback((id: string) => {
    setLocal((l) => {
      const next = new Map(l)
      next.delete(id)
      return next
    })
  }, [])

  const save = useCallback(
    (rec: AnyRecord) => {
      setLocal((l) => new Map(l).set(rec.clientId, rec))
      repo.save(rec).catch((e: unknown) => {
        undoLocal(rec.clientId)
        onError(e)
      })
    },
    [repo, onError, undoLocal],
  )

  const remove = useCallback(
    (clientId: string) => {
      setLocal((l) => new Map(l).set(clientId, null))
      repo.remove(clientId).catch((e: unknown) => {
        undoLocal(clientId)
        onError(e)
      })
    },
    [repo, onError, undoLocal],
  )

  return { sets, save, remove }
}
