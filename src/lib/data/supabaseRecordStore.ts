// 記録を Supabase のテーブルに送る RemoteRecordStore と、アプリで使う RecordRepository。
// 別のチームの記録は RLS で読めず、書けない（supabase/migrations）。
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecordRepository, SetRecords } from '../../contracts/index.ts'
import { createRecordRepository, type RemoteRecordStore } from './recordRepository.ts'
import {
  COLUMNS,
  TABLES,
  attackFromRow,
  pointFromRow,
  receptionFromRow,
  serveFromRow,
  toRow,
  type AttackRow,
  type PointRow,
  type ReceptionRow,
  type RecordTable,
  type ServeRow,
} from './recordRows.ts'
import { getSupabase } from './supabaseClient.ts'

const ALL_TABLES = Object.values(TABLES)

/** Supabase は失敗しても reject せず error を返すので、reject に直す */
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  if (res.data === null) throw new Error('データが返りませんでした')
  return res.data
}

/** getClient は最初に使うときに呼ぶ */
export function createSupabaseRecordStore(getClient: () => SupabaseClient): RemoteRecordStore {
  const select = async <R>(table: RecordTable, setId: string): Promise<R[]> =>
    check(
      await getClient()
        .from(table)
        .select(COLUMNS[table])
        .eq('set_id', setId)
        .order('recorded_at')
        .returns<R[]>(),
    )

  return {
    async upsert(rec) {
      const { table, row } = toRow(rec)
      // 型のないクライアントでは、テーブルの和集合から行の型を1つに決められないので、ただのオブジェクトとして渡す
      const values: Record<string, unknown> = { ...row }
      const { error } = await getClient().from(table).upsert(values, { onConflict: 'client_id' })
      if (error) throw new Error(error.message)
    },
    async remove(clientId) {
      // どのテーブルの記録かは clientId からは分からないので、4つとも消す（ないものは何もしない）
      const results = await Promise.all(
        ALL_TABLES.map((t) => getClient().from(t).delete().eq('client_id', clientId)),
      )
      for (const { error } of results) if (error) throw new Error(error.message)
    },
    async listBySet(setId): Promise<SetRecords> {
      const [serves, receptions, attacks, points] = await Promise.all([
        select<ServeRow>(TABLES.serve, setId),
        select<ReceptionRow>(TABLES.reception, setId),
        select<AttackRow>(TABLES.attack, setId),
        select<PointRow>(TABLES.point, setId),
      ])
      return {
        setId,
        serves: serves.map(serveFromRow),
        receptions: receptions.map(receptionFromRow),
        attacks: attacks.map(attackFromRow),
        points: points.map(pointFromRow),
      }
    },
    async listSetIds(matchId) {
      const rows = check(
        await getClient()
          .from('sets')
          .select('id')
          .eq('match_id', matchId)
          .order('set_no')
          .returns<{ id: string }[]>(),
      )
      return rows.map((r) => r.id)
    },
  }
}

/** アプリで使う RecordRepository。画面はフェイクの代わりにこれを使う */
export const recordRepository: RecordRepository = createRecordRepository(
  createSupabaseRecordStore(getSupabase),
)
