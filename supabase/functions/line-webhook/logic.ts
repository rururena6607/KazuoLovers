// line-webhook の純粋な処理（T-33、F-15）。Web 標準（crypto.subtle）だけを使うので、Vitest で確かめる
// （src/lib/data/lineWebhookLogic.test.ts）。何も import しない（ダッシュボードからでも配れるように）。
// 返信の文（選手の指標など）は T-34（とりはる）で作り直す。ここでは指標の式を使わない。

/** LINE のテキストの吹き出し1つの上限 */
export const MAX_TEXT_LENGTH = 5000

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
  '使い方',
  '・「結果」：最新の試合のセットごとの得点と、AI のコメント',
  '・「7番」（または #7）：その選手の最新の試合の記録',
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

export interface ResultInput {
  date: string
  opponentName: string | null
  tournament: string | null
  sets: readonly SetScore[]
  /** その試合の保存済みの AI コメント。なければ null（Gemini は待たない） */
  aiComment: string | null
}

const cut = (s: string) => (s.length <= MAX_TEXT_LENGTH ? s : `${s.slice(0, MAX_TEXT_LENGTH - 1)}…`)

/** 「結果」の返信。吹き出しは試合の得点と AI コメントの2つ */
export function formatResult(r: ResultInput): string[] {
  const title = [r.date, r.opponentName ? `vs ${r.opponentName}` : '練習', r.tournament].filter(Boolean).join(' ')
  const won = r.sets.filter((s) => s.ourScore > s.oppScore).length
  const lost = r.sets.filter((s) => s.ourScore < s.oppScore).length
  const scores = r.sets.length === 0 ? 'まだ得点の記録がありません' : r.sets.map((s) => `${s.ourScore}-${s.oppScore}`).join(' / ')
  const lines = [title, r.sets.length > 0 ? `セット ${won}-${lost}` : null, scores].filter(Boolean)
  const messages = [lines.join('\n')]
  messages.push(r.aiComment ? `AI のコメント\n${r.aiComment}` : 'AI のコメントはまだありません。アプリの分析画面で作れます。')
  return messages.map(cut)
}

export interface PlayerCountsInput {
  number: number
  date: string
  serves: number
  receptions: number
  attacks: number
}

/** 「7番」の返信。指標は T-34 で足す。それまでは本数だけ返す */
export function formatPlayerCounts(p: PlayerCountsInput): string {
  return cut(
    [`#${p.number}（${p.date} の試合）`, `サーブ ${p.serves}本`, `レシーブ ${p.receptions}本`, `アタック ${p.attacks}本`].join(
      '\n',
    ),
  )
}

/** Webhook の本文のうち、ここで使うもの */
export interface LineEvent {
  type: string
  replyToken?: string
  source?: { type: string; groupId?: string }
  message?: { type: string; text?: string }
}

export function parseEvents(body: unknown): LineEvent[] {
  if (typeof body !== 'object' || body === null) return []
  const events = (body as { events?: unknown }).events
  if (!Array.isArray(events)) return []
  return events.filter((e): e is LineEvent => typeof e === 'object' && e !== null && typeof e.type === 'string')
}
