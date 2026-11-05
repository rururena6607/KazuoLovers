// line-push（T-35、F-15）：公式戦が終わったら、試合の結果を部の LINE グループに送る（Push）。
// - ログインした部員が、記録画面から試合を終えたときに呼ぶ（src/lib/data/linePush.ts）
// - 公式戦（大会名のある試合）だけ。同じ試合は1回しか送らない（matches.line_pushed_at）
// - 送る前に今月の残りの通数とグループの人数を確かめ、足りなければ送らない
// シークレットは line-webhook と同じ（LINE_CHANNEL_ACCESS_TOKEN・LINE_TEAM_ID）。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { formatResult, setScoreFromPoints } from '../line-webhook/logic.ts'
import { PUSH_HEADER, checkQuota, isOfficialMatch, quotaMessage } from './logic.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
const TEAM_ID = Deno.env.get('LINE_TEAM_ID') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** sent：送ったか。message：画面に出す文 */
const json = (status: number, body: { sent: boolean; message: string }) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })

const line = (path: string) =>
  fetch(`https://api.line.me${path}`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }).then((r) =>
    r.ok ? r.json() : null,
  )

interface MatchRow {
  id: string
  date: string
  tournament: string | null
  opponent_id: string | null
}

/** 試合の結果の文を作って Push する。失敗したら throw する */
async function pushResult(
  admin: ReturnType<typeof createClient>,
  match: MatchRow,
  groupId: string,
): Promise<void> {
  const { data: sets } = await admin.from('sets').select('id,set_no').eq('match_id', match.id).order('set_no')
  const setIds = (sets ?? []).map((s: { id: string }) => s.id)
  const [{ data: opponent }, { data: points }, { data: report }] = await Promise.all([
    match.opponent_id
      ? admin.from('opponents').select('name').eq('id', match.opponent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('points').select('set_id,our_score,opp_score,recorded_at').in('set_id', setIds),
    admin
      .from('ai_reports')
      .select('comment')
      .eq('team_id', TEAM_ID)
      .eq('scope', `match:${match.id}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const [summary, ...rest] = formatResult({
    date: match.date,
    opponentName: opponent?.name ?? null,
    tournament: match.tournament,
    sets: (sets ?? [])
      .map((s: { id: string; set_no: number }) =>
        setScoreFromPoints(
          s.set_no,
          (points ?? []).filter((p: { set_id: string }) => p.set_id === s.id),
        ),
      )
      .filter((s) => s.ourScore + s.oppScore > 0),
    aiComment: report?.comment ?? null,
  })
  // AI のコメントがまだなければ、得点だけを送る（吹き出しの数は通数に関係しない）
  const texts = [`${PUSH_HEADER}\n${summary}`, ...(report ? rest : [])]

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: groupId, messages: texts.map((text) => ({ type: 'text', text })) }),
  })
  if (!res.ok) throw new Error(`LINE push ${res.status} ${await res.text()}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { sent: false, message: 'POST で送ってください。' })
  if (!ACCESS_TOKEN || !TEAM_ID) return json(500, { sent: false, message: 'LINE の設定がありません。' })
  const authorization = req.headers.get('Authorization')
  if (!authorization) return json(401, { sent: false, message: 'ログインしてください。' })

  let matchId: unknown
  try {
    matchId = ((await req.json()) as { matchId?: unknown }).matchId
  } catch {
    matchId = undefined
  }
  if (typeof matchId !== 'string') return json(400, { sent: false, message: '試合の指定が正しくありません。' })

  // 呼んだ部員の権限で試合を読む。RLS により、自分のチームの試合しか見えない
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: match } = await asUser
    .from('matches')
    .select('id,team_id,kind,date,tournament,opponent_id')
    .eq('id', matchId)
    .maybeSingle()
  if (!match) return json(404, { sent: false, message: '試合が見つかりません。' })
  if (match.team_id !== TEAM_ID) return json(403, { sent: false, message: 'LINE につないだチームの試合ではありません。' })
  if (!isOfficialMatch(match)) return json(200, { sent: false, message: '公式戦ではないので、LINE には送りません。' })

  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })
  const { data: team } = await admin.from('teams').select('line_group_id').eq('id', TEAM_ID).maybeSingle()
  const groupId: string | null = team?.line_group_id ?? null
  if (!groupId) return json(200, { sent: false, message: 'LINE のグループがまだつながっていません。' })

  const [quota, usage, members] = await Promise.all([
    line('/v2/bot/message/quota'),
    line('/v2/bot/message/quota/consumption'),
    line(`/v2/bot/group/${groupId}/members/count`),
  ])
  const check = checkQuota(quota, usage, members)
  if (!check) return json(502, { sent: false, message: 'LINE の残りの通数を確かめられなかったので、送りませんでした。' })
  if (!check.ok) return json(200, { sent: false, message: quotaMessage(check) })

  // 送る前に「送った」にする。同時に2回呼ばれても、送るのは1回だけ
  const { data: claimed } = await admin
    .from('matches')
    .update({ line_pushed_at: new Date().toISOString() })
    .eq('id', match.id)
    .is('line_pushed_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) return json(200, { sent: false, message: 'この試合の結果は、もう LINE に送ってあります。' })

  try {
    await pushResult(admin, match, groupId)
  } catch (e) {
    console.error('LINE push', e)
    // 送れなかったので、あとで送り直せるように戻す
    await admin.from('matches').update({ line_pushed_at: null }).eq('id', match.id)
    return json(502, { sent: false, message: 'LINE に送れませんでした。' })
  }
  return json(200, { sent: true, message: `LINE のグループに送りました（${check.need} 通）。` })
})
