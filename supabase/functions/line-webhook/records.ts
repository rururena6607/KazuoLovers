// 試合の記録の行（serves・receptions・attacks）を読む（T-34）。line-webhook と line-push で使う。
// 列は src/lib/data/recordRows.ts の COLUMNS（アプリが読むのと同じ）。
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  COLUMNS,
  TABLES,
  type AttackRow,
  type ReceptionRow,
  type ServeRow,
} from '../../../src/lib/data/recordRows.ts'
import type { RecordRows } from './logic.ts'

/** セットの記録を読む。読めなければ throw する（本数の足りない指標を返さないため） */
export async function fetchRecordRows(db: SupabaseClient, setIds: readonly string[]): Promise<RecordRows> {
  if (setIds.length === 0) return { serves: [], receptions: [], attacks: [] }
  const read = async (table: 'serves' | 'receptions' | 'attacks') => {
    const { data, error } = await db.from(table).select(COLUMNS[table]).in('set_id', [...setIds])
    if (error) throw new Error(`${table}: ${error.message}`)
    return data ?? []
  }
  const [serves, receptions, attacks] = await Promise.all([
    read(TABLES.serve),
    read(TABLES.reception),
    read(TABLES.attack),
  ])
  return {
    serves: serves as unknown as ServeRow[],
    receptions: receptions as unknown as ReceptionRow[],
    attacks: attacks as unknown as AttackRow[],
  }
}
