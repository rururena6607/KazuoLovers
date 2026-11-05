// 保存した記録を、RecordRepository の通知を待たずに画面へ出すための重ね合わせ。
// 通知が遅れる（本物の repo は IndexedDB・通信を挟む）ときや、
// 電波がなくて送信待ちの記録が通知に含まれないときも、得点や「直前の1本」がずれないようにする。
import type { AnyRecord, SetRecords } from '../../contracts/index.ts'
import { byRecordedAt } from './score.ts'

/** clientId → 端末で保存した記録（null は消した記録） */
export type LocalChanges = ReadonlyMap<string, AnyRecord | null>

const listOf = (s: SetRecords, rec: AnyRecord): AnyRecord[] => {
  switch (rec.kind) {
    case 'serve':
      return s.serves
    case 'reception':
      return s.receptions
    case 'attack':
      return s.attacks
    case 'opp_attack':
      // 古いデータでは未設定のことがあるので、なければ作ってから返す（push した記録を落とさない）
      return (s.oppAttacks ??= [])
    case 'point':
      return s.points
  }
}

/** 通知された記録に、端末での保存・削除を重ねる。各配列は時刻順 */
export function overlay(remote: readonly SetRecords[], local: LocalChanges): SetRecords[] {
  if (local.size === 0) return [...remote]
  const bySet = new Map<string, SetRecords>()
  for (const s of remote) {
    bySet.set(s.setId, {
      setId: s.setId,
      serves: s.serves.filter((r) => !local.has(r.clientId)),
      receptions: s.receptions.filter((r) => !local.has(r.clientId)),
      attacks: s.attacks.filter((r) => !local.has(r.clientId)),
      oppAttacks: (s.oppAttacks ?? []).filter((r) => !local.has(r.clientId)),
      points: s.points.filter((r) => !local.has(r.clientId)),
    })
  }
  for (const rec of local.values()) {
    if (!rec) continue
    let s = bySet.get(rec.setId)
    if (!s) {
      s = { setId: rec.setId, serves: [], receptions: [], attacks: [], oppAttacks: [], points: [] }
      bySet.set(rec.setId, s)
    }
    // kind と配列の型は listOf で対応している
    listOf(s, rec).push(rec as never)
  }
  for (const s of bySet.values()) {
    s.serves.sort(byRecordedAt)
    s.receptions.sort(byRecordedAt)
    s.attacks.sort(byRecordedAt)
    s.oppAttacks?.sort(byRecordedAt)
    s.points.sort(byRecordedAt)
  }
  return [...bySet.values()]
}

const sameRecord = (a: AnyRecord, b: AnyRecord): boolean => JSON.stringify(a) === JSON.stringify(b)

/** 通知に反映された変更を外す（保存した記録が届いた・消した記録がなくなった） */
export function prune(local: LocalChanges, remote: readonly SetRecords[]): LocalChanges {
  if (local.size === 0) return local
  const found = new Map<string, AnyRecord>()
  for (const s of remote) {
    for (const r of [...s.serves, ...s.receptions, ...s.attacks, ...(s.oppAttacks ?? []), ...s.points]) found.set(r.clientId, r)
  }
  const next = new Map(local)
  for (const [id, rec] of local) {
    const there = found.get(id)
    if (rec === null ? there === undefined : there !== undefined && sameRecord(there, rec)) {
      next.delete(id)
    }
  }
  return next.size === local.size ? local : next
}
