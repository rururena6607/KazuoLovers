// ai-report（T-30、F-13）：分析画面から集計の JSON を受け取り、Claude API のコメントを返して ai_reports に残す。
// - ログインした部員だけが、自分のチームについて呼べる（RLS で確かめる）
// - 同じ範囲で同じ集計なら、保存済みのコメントを返す（料金の節約）
// - 選手の名前が入っていたら送らない
// 秘密情報（ANTHROPIC_API_KEY）は Edge Functions のシークレットに置く。配り方は supabase/README.md。
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  buildPrompt,
  canonicalJson,
  commentFromClaude,
  DEFAULT_CLAUDE_MODEL,
  findPersonalData,
  parseRequest,
  startOfDayJst,
} from './logic.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
/** 要件定義書 8 章のモデル。替えるときはシークレットで替える */
const CLAUDE_MODEL = Deno.env.get('CLAUDE_MODEL') ?? DEFAULT_CLAUDE_MODEL
/** 1チームが1日に作れるコメントの数（保存済みを返すときは数えない） */
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '20')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })

const fail = (status: number, error: string) => json(status, { error })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'POST で送ってください。')
  if (!ANTHROPIC_API_KEY) return fail(500, 'ANTHROPIC_API_KEY が設定されていません。')

  const authorization = req.headers.get('Authorization')
  if (!authorization) return fail(401, 'ログインしてください。')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail(400, '送られた内容が正しくありません。')
  }
  const request = parseRequest(body)
  if (typeof request === 'string') return fail(400, request)
  const { teamId, scope, summary, force } = request

  // 呼んだ部員の権限で読む。RLS により、自分のチームの行しか見えない
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userError } = await asUser.auth.getUser()
  if (userError || !userData.user) return fail(401, 'ログインしてください。')

  const { data: team } = await asUser.from('teams').select('id').eq('id', teamId).maybeSingle()
  if (!team) return fail(403, 'このチームの部員ではありません。')

  const { data: players, error: playersError } = await asUser
    .from('players')
    .select('name')
    .eq('team_id', teamId)
  if (playersError) return fail(500, '選手を読めませんでした。')
  const personal = findPersonalData(summary, (players ?? []).map((p: { name: string }) => p.name))
  if (personal) return fail(400, personal)

  const { data: latest } = await asUser
    .from('ai_reports')
    .select('comment,input_json,created_at')
    .eq('team_id', teamId)
    .eq('scope', scope)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!force && latest && canonicalJson(latest.input_json) === canonicalJson(summary)) {
    return json(200, { comment: latest.comment, cached: true, createdAt: latest.created_at })
  }

  // ai_reports に書けるのは Edge Function（service_role）だけ（supabase/migrations）
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { count } = await admin
    .from('ai_reports')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .gte('created_at', startOfDayJst(new Date()))
  if ((count ?? 0) >= DAILY_LIMIT) {
    return fail(429, `今日の AI コメントは ${DAILY_LIMIT} 回までです。明日もう一度試してください。`)
  }

  let comment: string | null
  try {
    // 再試行はしない（時間切れのあとに作り直すと、料金を二重に払う）。Edge Function の上限（150 秒）に収める
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 0 })
    const { system, user } = buildPrompt(summary)
    const response = await anthropic.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // 600 字ほどのコメントなので、考える量は中くらいにする
      output_config: { effort: 'medium' },
      // 安全のための判定で断られたら、サーバー側でほかのモデルに替えて作り直す
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: user }],
    })
    comment = commentFromClaude(response)
    if (!comment) console.error('Claude', response.stop_reason, response.stop_details)
    if (response.stop_reason === 'refusal') {
      return fail(502, 'AI がこの内容へのコメントを断りました。範囲を変えて試してください。')
    }
  } catch (e) {
    console.error('Claude', e)
    if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529)) {
      return fail(429, 'AI が混み合っています。しばらく待ってから、もう一度試してください。')
    }
    if (e instanceof Anthropic.APIConnectionTimeoutError) {
      return fail(504, 'AI の応答が遅いので、やめました。もう一度試してください。')
    }
    return fail(502, 'AI のコメントを作れませんでした。')
  }
  if (!comment) return fail(502, 'AI のコメントが空でした。もう一度試してください。')

  const { data: saved, error: saveError } = await admin
    .from('ai_reports')
    .insert({ team_id: teamId, scope, input_json: summary, comment })
    .select('created_at')
    .single()
  if (saveError) console.error('ai_reports', saveError)

  return json(200, { comment, cached: false, createdAt: saved?.created_at ?? new Date().toISOString() })
})
