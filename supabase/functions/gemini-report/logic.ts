// gemini-report の純粋な処理（T-30、F-13）。Deno にもブラウザにも依存しないので、Vitest で確かめる
// （src/lib/data/geminiReportLogic.test.ts）。何も import しない（ダッシュボードからでも配れるように）。

/** 範囲（scope）の長さの上限。例：match:<試合の id>、set:<セットの id>、all */
export const MAX_SCOPE_LENGTH = 200

/** 送ってよい集計の大きさの上限（文字数）。大きすぎると Gemini の無料枠を使い切る */
export const MAX_SUMMARY_LENGTH = 30_000

/** 本数がこれより少ない項目は参考値。集計の JSON に minSample がなければ使う（contracts の MIN_SAMPLE と同じ値） */
export const DEFAULT_MIN_SAMPLE = 10

export interface ReportRequest {
  teamId: string
  scope: string
  summary: Record<string, unknown>
  /** true なら、同じ集計の保存済みコメントがあっても作り直す */
  force: boolean
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 受け取った本文を確かめる。正しくなければ、画面に出す理由を返す */
export function parseRequest(body: unknown): ReportRequest | string {
  if (!isRecord(body)) return '送られた内容が正しくありません。'
  const { teamId, scope, summary, force } = body
  if (typeof teamId !== 'string' || !UUID.test(teamId)) return 'チームの指定が正しくありません。'
  if (typeof scope !== 'string' || scope === '' || scope.length > MAX_SCOPE_LENGTH) {
    return '範囲の指定が正しくありません。'
  }
  if (!isRecord(summary)) return '集計の内容が正しくありません。'
  if (JSON.stringify(summary).length > MAX_SUMMARY_LENGTH) return '集計が大きすぎます。範囲を狭めてください。'
  return { teamId, scope, summary, force: force === true }
}

/** キーを並べ替えた JSON。jsonb は保存するとキーの順が変わるので、同じ集計かどうかはこれで比べる */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** 外部に出してはいけないキー。T-31 の集計には入らないが、念のため Edge Function でも止める */
const FORBIDDEN_KEYS = new Set(['name', 'names', 'playername', 'teamname', 'school', 'email'])

/**
 * 集計に選手の名前などが入っていないか確かめる（要件定義書 3 章「個人情報」）。
 * 入っていれば、その理由を返す。names はそのチームの選手の名前
 */
export function findPersonalData(summary: unknown, names: readonly string[]): string | null {
  const strings: string[] = []
  const walk = (v: unknown): string | null => {
    if (Array.isArray(v)) {
      for (const x of v) {
        const found = walk(x)
        if (found) return found
      }
    } else if (isRecord(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.has(k.toLowerCase().replace(/[_-]/g, ''))) return `「${k}」は送れません。`
        const found = walk(x)
        if (found) return found
      }
    } else if (typeof v === 'string') {
      strings.push(v)
    }
    return null
  }
  const byKey = walk(summary)
  if (byKey) return byKey
  const text = strings.join('\n')
  for (const raw of names) {
    const name = raw.trim()
    // 1文字の名前は、ほかの文字と区別できないので見ない
    if (name.length >= 2 && text.includes(name)) return '選手の名前が入っているので送れません。'
  }
  return null
}

/** 日本時間のその日の 0 時（ISO 8601）。1日あたりの回数の上限に使う */
export function startOfDayJst(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  jst.setUTCHours(0, 0, 0, 0)
  return new Date(jst.getTime() - 9 * 60 * 60 * 1000).toISOString()
}

export function buildPrompt(summary: Record<string, unknown>): { system: string; user: string } {
  const minSample = typeof summary.minSample === 'number' ? summary.minSample : DEFAULT_MIN_SAMPLE
  const system = [
    'あなたは高専のバレーボール部の分析担当です。渡された集計の数値だけを根拠に、部員とコーチ向けのコメントを日本語で書きます。',
    '',
    '守ること：',
    '- 選手は「#7」のように背番号で呼ぶ。名前を推測して書かない',
    `- 本数が ${minSample} 本未満の項目（reference が true のもの）は参考程度に扱い、「傾向がある」「まだ本数が少ない」のように書き、断定しない`,
    '- 集計にない数値や、試合の状況を作らない',
    '- 率は % で、小数第1位まで書く（例：34.0%）。サーブ効果率はマイナスになることがある',
    '- 用語：サーブ効果率、エース率、ミス率、サーブレシーブ成功率（A と B の割合）、被エース率、アタック決定率、崩し率（エース＋C＋D の割合）',
    '',
    '形式（見出しはこのまま。全体で 600 字以内。マークダウンの太字や表は使わない）：',
    '【良かった点】箇条書きで 2〜3 個',
    '【課題】箇条書きで 2〜3 個',
    '【練習メニュー案】課題に合わせて、次の練習で試せるものを 2〜3 個。誰向けか（背番号や全体）を書く',
  ].join('\n')
  const user = `次の集計（JSON）を分析してください。\n\n${JSON.stringify(summary)}`
  return { system, user }
}

/** Gemini の generateContent に送る本文 */
export function geminiRequestBody(summary: Record<string, unknown>) {
  const { system, user } = buildPrompt(summary)
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.4 },
  }
}

/** Gemini の応答からコメントの文字列を取り出す。取り出せなければ null */
export function commentFromGemini(response: unknown): string | null {
  if (!isRecord(response) || !Array.isArray(response.candidates)) return null
  const first: unknown = response.candidates[0]
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) return null
  const text = first.content.parts
    .map((p: unknown) => (isRecord(p) && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()
  return text === '' ? null : text
}
