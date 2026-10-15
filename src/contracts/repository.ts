// 記録の保存と読み込み。画面はこのインターフェースだけを使い、Supabase を直接呼ばない。
// 本物は lib/data（ひろし、T-14・T-15）。画面を作るあいだは createFakeRecordRepository を使う。
import type { AnyRecord, AttackRecord, PointRecord, ReceptionRecord, ServeRecord } from './records.ts'

export interface SetRecords {
  setId: string
  serves: ServeRecord[]
  receptions: ReceptionRecord[]
  attacks: AttackRecord[]
  points: PointRecord[]
}

/** 呼ぶと購読をやめる */
export type Unsubscribe = () => void

export interface RecordRepository {
  /** 保存する。送れなくても失敗にせず、送信待ちに残す。同じ clientId は上書きする */
  save(rec: AnyRecord): Promise<void>
  remove(clientId: string): Promise<void>
  listBySet(setId: string): Promise<SetRecords>
  /** その試合のセットの記録が変わるたびに呼ぶ。登録した直後にも1回呼ぶ */
  subscribe(matchId: string, onChange: (sets: SetRecords[]) => void): Unsubscribe
  /** 未送信の件数が変わるたびに呼ぶ。登録した直後にも1回呼ぶ */
  subscribePending(onChange: (count: number) => void): Unsubscribe
  /** 未送信の記録をすぐに送り直す */
  retry(): Promise<void>
}
