// line-webhook（T-33、F-15）：LINE の Webhook を受けて、部のグループに返信する。
// - 署名（x-line-signature）を確かめ、LINE からの正しいリクエストだけを受け付ける
// - Bot をグループに招待したとき（join）、そのグループを LINE_TEAM_ID のチームにつなぐ。
//   つなげるのは最初の1グループだけ（ほかのグループに招待されても、チームのデータは返さない）
// - つないだグループで「結果」「7番」「ヘルプ」と送られたら返信する（Reply なので通数を使わない）
// LINE は Supabase のログインを持たないので、JWT の確かめをオフにして配る（supabase/README.md）。
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  HELP_TEXT,
  formatPlayerCounts,
  formatResult,
  parseCommand,
  parseEvents,
  setScoreFromPoints,
  verifySignature,
  type LineEvent,
} from './logic.ts'

const CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET') ?? ''
const ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
const TEAM_ID = Deno.env.get('LINE_TEAM_ID') ?? ''

// Webhook にはログインした部員がいないので service_role で読む。読むのは TEAM_ID のチームの行だけ
const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})

async function reply(replyToken: string, texts: string[]): Promise<void> {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}` },
    // 吹き出しは5つまで
    body: JSON.stringify({ replyToken, messages: texts.slice(0, 5).map((text) => ({ type: 'text', text })) }),
  })
  if (!res.ok) console.error('LINE reply', res.status, await res.text())
}

/** 最新の試合（練習は除く）と、そのセット */
async function latestMatch() {
  const { data: match } = await db
    .from('matches')
    .select('id,date,tournament,opponent_id')
    .eq('team_id', TEAM_ID)
    .eq('kind', 'match')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!match) return null
  const { data: sets } = await db.from('sets').select('id,set_no').eq('match_id', match.id).order('set_no')
  return { match, sets: sets ?? [] }
}

async function resultTexts(): Promise<string[]> {
  const latest = await latestMatch()
  if (!latest) return ['まだ試合の記録がありません。']
  const { match, sets } = latest
  const [{ data: opponent }, { data: points }, { data: report }] = await Promise.all([
    match.opponent_id
      ? db.from('opponents').select('name').eq('id', match.opponent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('points')
      .select('set_id,our_score,opp_score,recorded_at')
      .in('set_id', sets.map((s) => s.id)),
    // Gemini の応答は待たず、保存済みのコメントを返す（返信は1分以内）
    db
      .from('ai_reports')
      .select('comment')
      .eq('team_id', TEAM_ID)
      .eq('scope', `match:${match.id}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return formatResult({
    date: match.date,
    opponentName: opponent?.name ?? null,
    tournament: match.tournament,
    sets: sets
      .map((s) => setScoreFromPoints(s.set_no, (points ?? []).filter((p) => p.set_id === s.id)))
      .filter((s) => s.ourScore + s.oppScore > 0),
    aiComment: report?.comment ?? null,
  })
}

async function playerTexts(number: number): Promise<string[]> {
  const { data: players } = await db
    .from('players')
    .select('id,active')
    .eq('team_id', TEAM_ID)
    .eq('number', number)
    .order('active', { ascending: false })
    .limit(1)
  const player = players?.[0]
  if (!player) return [`#${number} の選手は登録されていません。`]
  const latest = await latestMatch()
  if (!latest) return ['まだ試合の記録がありません。']
  const setIds = latest.sets.map((s) => s.id)
  const count = async (table: string, column: string) => {
    const { count: n } = await db
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, player.id)
      .in('set_id', setIds)
    return n ?? 0
  }
  const [serves, receptions, attacks] = await Promise.all([
    count('serves', 'server_id'),
    count('receptions', 'receiver_id'),
    count('attacks', 'attacker_id'),
  ])
  return [formatPlayerCounts({ number, date: latest.match.date, serves, receptions, attacks })]
}

/** join：まだどのグループにもつながっていなければ、このグループをつなぐ */
async function onJoin(event: LineEvent, groupId: string): Promise<void> {
  const { data: team } = await db.from('teams').select('line_group_id').eq('id', TEAM_ID).maybeSingle()
  if (!team) return
  if (team.line_group_id && team.line_group_id !== groupId) {
    if (event.replyToken) await reply(event.replyToken, ['このBotは、すでに別のグループにつながっています。'])
    return
  }
  if (!team.line_group_id) {
    const { error } = await db.from('teams').update({ line_group_id: groupId }).eq('id', TEAM_ID).is('line_group_id', null)
    if (error) {
      console.error('teams.line_group_id', error)
      return
    }
  }
  if (event.replyToken) await reply(event.replyToken, [`このグループをチームにつなぎました。\n\n${HELP_TEXT}`])
}

async function handle(event: LineEvent): Promise<void> {
  const groupId = event.source?.type === 'group' ? event.source.groupId : undefined
  if (!groupId) return
  if (event.type === 'join') return onJoin(event, groupId)
  if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) return
  const command = parseCommand(event.message.text ?? '')
  if (!command) return

  // つないだグループにだけ返す
  const { data: team } = await db.from('teams').select('line_group_id').eq('id', TEAM_ID).maybeSingle()
  if (!team || team.line_group_id !== groupId) return

  const texts =
    command.type === 'help' ? [HELP_TEXT] : command.type === 'result' ? await resultTexts() : await playerTexts(command.number)
  await reply(event.replyToken, texts)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })
  if (!CHANNEL_SECRET || !ACCESS_TOKEN || !TEAM_ID) {
    console.error('LINE_CHANNEL_SECRET・LINE_CHANNEL_ACCESS_TOKEN・LINE_TEAM_ID を設定してください')
    return new Response('not configured', { status: 500 })
  }
  // 署名は受け取ったままの本文で確かめる
  const body = await req.text()
  if (!(await verifySignature(body, req.headers.get('x-line-signature'), CHANNEL_SECRET))) {
    return new Response('bad signature', { status: 401 })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return new Response('bad json', { status: 400 })
  }
  // 1つの失敗で、ほかのイベントの返信を止めない。LINE には必ず 200 を返す（返さないと送り直しやエラーになる）
  const results = await Promise.allSettled(parseEvents(parsed).map(handle))
  for (const r of results) if (r.status === 'rejected') console.error('LINE event', r.reason)
  return new Response('ok')
})
