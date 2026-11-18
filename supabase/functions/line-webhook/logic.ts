// line-webhook の純粋な処理（T-33、T-34、F-15）。Vitest で確かめる（src/lib/data/lineWebhook.test.ts）。
// 返信の文は src/lib/stats/lineReply.ts（T-34）で作る。ここでは、テーブルの行をその入力に直すだけで、指標の式は持たない。
// 行から記録への変換は src/lib/data/recordRows.ts を使う。src/ を import するので、ダッシュボードからは配れない。
// CLI（npx supabase functions deploy … --use-api）で配る（supabase/README.md）。
import type { LinePlayerInput, LineSetResult } from '../../../src/lib/stats/lineReply.ts'
import {
  attackFromRow,
  receptionFromRow,
  serveFromRow,
  type AttackRow,
  type ReceptionRow,
  type ServeRow,
} from '../../../src/lib/data/recordRows.ts'

/**
 * x-line-signature を確かめる。本文を channel secret で HMAC-SHA256 にし、Base64 にしたものと同じなら正しい。
 * 本文は受け取ったままの文字列で確かめる（JSON にしてから戻すと変わる）
 */
export async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  let binary = ''
  for (const b of mac) binary += String.fromCharCode(b)
  return timingSafeEqual(btoa(binary), signature)
}

/** 長さ以外で、どこが違うかを時間から知られないように比べる */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export type Command = { type: 'result' } | { type: 'player'; number: number } | { type: 'help' }

/** 全角の数字・＃を半角にする */
const toHalfWidth = (s: string) =>
  s.replace(/[０-９＃]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

/** 送られた文を、Bot への頼みごとに直す。関係のない会話なら null（返信しない） */
export function parseCommand(text: string): Command | null {
  const t = toHalfWidth(text).trim().replace(/\s+/g, '')
  if (/^(結果|けっか)$/.test(t)) return { type: 'result' }
  if (/^(ヘルプ|へるぷ|使い方|help)$/i.test(t)) return { type: 'help' }
  const m = /^(?:#(\d{1,2})|(\d{1,2})番)$/.exec(t)
  if (m) return { type: 'player', number: Number(m[1] ?? m[2]) }
  return null
}

export const HELP_TEXT = [
  '使い方（Bot をメンションして送ってください。例：@Bot 結果）',
  '・「結果」：最新の試合のセットごとの得点と、AI のコメント',
  '・「7番」（または #7）：その選手の最新の試合の記録',
  '・「ヘルプ」：この使い方',
].join('\n')

export interface SetScore {
  setNo: number
  ourScore: number
  oppScore: number
}

/** 得点の記録（1点ずつ）から、セットの得点を出す。いちばん新しい記録の得点がそのセットの得点 */
export function setScoreFromPoints(
  setNo: number,
  points: readonly { our_score: number; opp_score: number; recorded_at: string }[],
): SetScore {
  let last: (typeof points)[number] | null = null
  for (const p of points) {
    if (!last || Date.parse(p.recorded_at) >= Date.parse(last.recorded_at)) last = p
  }
  return { setNo, ourScore: last?.our_score ?? 0, oppScore: last?.opp_score ?? 0 }
}

/** 1つの試合の記録の行（serves・receptions・attacks。列は recordRows.ts の COLUMNS） */
export interface RecordRows {
  serves: readonly ServeRow[]
  receptions: readonly ReceptionRow[]
  attacks: readonly AttackRow[]
}

/**
 * セットの行・得点の行・記録の行から、「結果」の返信（formatMatchResult）のセットを作る。
 * 得点の記録がないセット（0-0）は出さない
 */
export function setResultsFromRows(
  sets: readonly { id: string; set_no: number }[],
  points: readonly { set_id: string; our_score: number; opp_score: number; recorded_at: string }[],
  rows: RecordRows,
): LineSetResult[] {
  return sets
    .map((s) => ({
      ...setScoreFromPoints(
        s.set_no,
        points.filter((p) => p.set_id === s.id),
      ),
      records: {
        serves: rows.serves.filter((r) => r.set_id === s.id).map(serveFromRow),
        receptions: rows.receptions.filter((r) => r.set_id === s.id).map(receptionFromRow),
        attacks: rows.attacks.filter((r) => r.set_id === s.id).map(attackFromRow),
      },
    }))
    .filter((s) => s.ourScore + s.oppScore > 0)
}

/** 記録の行から、「7番」の返信（formatPlayerReport）の入力を作る。その選手が打った・受けた記録だけを使う */
export function playerInputFromRows(
  number: number,
  playerId: string,
  date: string,
  rows: RecordRows,
): LinePlayerInput {
  return {
    number,
    date,
    serves: rows.serves.filter((r) => r.server_id === playerId).map(serveFromRow),
    receptions: rows.receptions.filter((r) => r.receiver_id === playerId).map(receptionFromRow),
    attacks: rows.attacks.filter((r) => r.attacker_id === playerId).map(attackFromRow),
  }
}

/** Webhook の本文のうち、ここで使うもの */
/** メンションされた相手1人分。index・length は text の中の位置（文字数）。isSelf は Bot 自身なら true */
export interface LineMentionee {
  index: number
  length: number
  isSelf?: boolean
}

export interface LineEvent {
  type: string
  replyToken?: string
  source?: { type: string; groupId?: string }
  message?: { type: string; text?: string; mention?: { mentionees?: LineMentionee[] } }
}

/**
 * Bot がメンションされていれば、メンションの部分（@Bot の名前）を取り除いた文を返す。
 * Bot がメンションされていなければ null（グループの会話には反応しない）
 */
export function textForBot(message: LineEvent['message']): string | null {
  const text = message?.text ?? ''
  const mentionees = message?.mention?.mentionees ?? []
  const self = mentionees.filter(
    (m) => m.isSelf === true && Number.isInteger(m.index) && Number.isInteger(m.length) && m.index >= 0 && m.length > 0,
  )
  if (self.length === 0) return null
  // 後ろから取り除くと、前のメンションの位置がずれない
  return [...self]
    .sort((a, b) => b.index - a.index)
    .reduce((t, m) => t.slice(0, m.index) + t.slice(m.index + m.length), text)
}

export function parseEvents(body: unknown): LineEvent[] {
  if (typeof body !== 'object' || body === null) return []
  const events = (body as { events?: unknown }).events
  if (!Array.isArray(events)) return []
  return events.filter((e): e is LineEvent => typeof e === 'object' && e !== null && typeof e.type === 'string')
}
