// Edge Function line-webhook（supabase/functions）の純粋な処理のテスト。
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { formatMatchResult, formatPlayerReport } from '../stats/lineReply.ts'
import {
  parseCommand,
  parseEvents,
  playerInputFromRows,
  setResultsFromRows,
  setScoreFromPoints,
  textForBot,
  verifySignature,
  type RecordRows,
} from '../../../supabase/functions/line-webhook/logic.ts'
import type { ReceptionRow, ServeRow } from './recordRows.ts'

const SECRET = 'test-channel-secret'
const body = JSON.stringify({ destination: 'U1', events: [{ type: 'message', replyToken: 'r1' }] })
/** LINE と同じ作り方の署名（Node の crypto で作り、こちらの実装と突き合わせる） */
const sign = (b: string, secret = SECRET) => createHmac('sha256', secret).update(b).digest('base64')

describe('verifySignature', () => {
  it('channel secret で作った署名なら通す', async () => {
    expect(await verifySignature(body, sign(body), SECRET)).toBe(true)
  })

  it('本文・秘密・署名のどれかが違えば通さない。署名がなければ通さない', async () => {
    expect(await verifySignature(`${body} `, sign(body), SECRET)).toBe(false)
    expect(await verifySignature(body, sign(body, 'other'), SECRET)).toBe(false)
    expect(await verifySignature(body, null, SECRET)).toBe(false)
    expect(await verifySignature(body, sign(body), '')).toBe(false)
  })

  it('日本語の本文でも、受け取ったままの文字列で確かめる', async () => {
    const jp = JSON.stringify({ events: [{ type: 'message', message: { type: 'text', text: '結果' } }] })
    expect(await verifySignature(jp, sign(jp), SECRET)).toBe(true)
  })
})

describe('parseCommand', () => {
  it('「結果」「7番」「#7」「ヘルプ」を読む。全角や前後の空白も許す', () => {
    expect(parseCommand('結果')).toEqual({ type: 'result' })
    expect(parseCommand(' けっか ')).toEqual({ type: 'result' })
    expect(parseCommand('7番')).toEqual({ type: 'player', number: 7 })
    expect(parseCommand('１２番')).toEqual({ type: 'player', number: 12 })
    expect(parseCommand('＃3')).toEqual({ type: 'player', number: 3 })
    expect(parseCommand('#10')).toEqual({ type: 'player', number: 10 })
    expect(parseCommand('使い方')).toEqual({ type: 'help' })
  })

  it('ふつうの会話には返信しない', () => {
    expect(parseCommand('今日の結果どうだった？')).toBeNull()
    expect(parseCommand('7番のサーブよかった')).toBeNull()
    expect(parseCommand('100番')).toBeNull()
    expect(parseCommand('')).toBeNull()
  })
})

describe('setScoreFromPoints', () => {
  it('いちばん新しい得点の記録が、そのセットの得点', () => {
    const points = [
      { our_score: 1, opp_score: 0, recorded_at: '2026-10-29T10:00:01Z' },
      { our_score: 25, opp_score: 22, recorded_at: '2026-10-29T10:30:00Z' },
      { our_score: 24, opp_score: 22, recorded_at: '2026-10-29T10:29:00+00:00' },
    ]
    expect(setScoreFromPoints(1, points)).toEqual({ setNo: 1, ourScore: 25, oppScore: 22 })
    expect(setScoreFromPoints(2, [])).toEqual({ setNo: 2, ourScore: 0, oppScore: 0 })
  })
})

// 要件定義書 5 章の計算例：10本打ってエース1・効果3（C＋D）・ミス2 → サーブ効果率 12.5%、
// 10本受けて A5・B3 → サーブレシーブ成功率 65%
const serveRow = (n: number, serverId: string, setId: string, result: ServeRow['result'], reception: ServeRow['reception']): ServeRow => ({
  client_id: `s${n}`,
  set_id: setId,
  server_id: serverId,
  serve_type: 'float',
  from_x: null,
  to_x: null,
  to_y: null,
  target_zone: null,
  speed: null,
  result,
  miss_type: result === 'miss' ? 'net' : null,
  reception,
  receiver_id: null,
  recorded_at: '2026-10-29T10:00:00+00:00',
})
const receptionRow = (n: number, receiverId: string, setId: string, result: ReceptionRow['result']): ReceptionRow => ({
  client_id: `r${n}`,
  set_id: setId,
  receiver_id: receiverId,
  opp_server_id: null,
  opp_serve_type: null,
  at_x: null,
  at_y: null,
  result,
  recorded_at: '2026-10-29T10:00:00+00:00',
})

/** #7（p7）の記録：サーブ 10 本（エース1・C1・D2・A3・B1・ミス2）、レシーブ 10 本（A5・B3・C1・D1）。すべてセット s1 */
const p7Serves: ServeRow[] = [
  serveRow(1, 'p7', 's1', 'ace', null),
  serveRow(2, 'p7', 's1', 'in', 'C'),
  serveRow(3, 'p7', 's1', 'in', 'D'),
  serveRow(4, 'p7', 's1', 'in', 'D'),
  serveRow(5, 'p7', 's1', 'in', 'A'),
  serveRow(6, 'p7', 's1', 'in', 'A'),
  serveRow(7, 'p7', 's1', 'in', 'A'),
  serveRow(8, 'p7', 's1', 'in', 'B'),
  serveRow(9, 'p7', 's1', 'miss', null),
  serveRow(10, 'p7', 's1', 'miss', null),
]
const p7Receptions: ReceptionRow[] = (['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'C', 'D'] as const).map((g, i) =>
  receptionRow(i + 1, 'p7', 's1', g),
)

describe('setResultsFromRows（「結果」の入力）', () => {
  const sets = [
    { id: 's1', set_no: 1 },
    { id: 's2', set_no: 2 },
  ]
  const points = [{ set_id: 's1', our_score: 25, opp_score: 22, recorded_at: '2026-10-29T10:30:00Z' }]
  const rows: RecordRows = { serves: p7Serves, receptions: p7Receptions, attacks: [] }

  it('記録をセットごとに分け、得点の記録がないセットは出さない', () => {
    const result = setResultsFromRows(sets, points, rows)
    expect(result.map((s) => [s.setNo, s.ourScore, s.oppScore])).toEqual([[1, 25, 22]])
    expect(result[0]?.records.serves).toHaveLength(10)
    expect(result[0]?.records.receptions).toHaveLength(10)
  })

  it('formatMatchResult に渡すと、セットの得点とチームの指標（5 章の計算例の値）が出る', () => {
    const texts = formatMatchResult({
      date: '2026-10-29',
      opponentName: '熊本工業',
      tournament: '新人戦',
      sets: setResultsFromRows(sets, points, rows),
      aiComment: null,
    })
    expect(texts[0]).toBe(
      [
        '2026-10-29 vs 熊本工業 新人戦',
        'セット 1-0',
        '25-22',
        '',
        'サーブ 打数10 サーブ効果率12.5% エース率10.0% ミス率20.0%',
        'レシーブ 受数10 サーブレシーブ成功率65.0% 被エース率0.0%',
        'アタック 打数0 アタック決定率− 効果率− 失点0',
      ].join('\n'),
    )
  })
})

describe('playerInputFromRows（「7番」の入力）', () => {
  // ほかの選手（p8）の記録は入れない
  const rows: RecordRows = {
    serves: [...p7Serves, serveRow(11, 'p8', 's1', 'ace', null)],
    receptions: [...p7Receptions, receptionRow(11, 'p8', 's1', 'ace')],
    attacks: [],
  }

  it('その選手の記録だけを使い、formatPlayerReport で 5 章の計算例の値になる', () => {
    const input = playerInputFromRows(7, 'p7', '2026-10-29', rows)
    expect(input.serves).toHaveLength(10)
    expect(input.receptions).toHaveLength(10)
    expect(formatPlayerReport(input)).toBe(
      [
        '#7（2026-10-29 の試合）',
        'サーブ 打数10 サーブ効果率12.5% ミス率20.0%',
        'レシーブ 受数10 サーブレシーブ成功率65.0%',
        'アタック 記録なし',
      ].join('\n'),
    )
  })
})

describe('parseEvents', () => {
  it('events の配列だけを読む。Webhook の「検証」（events が空）も受け付ける', () => {
    expect(parseEvents({ events: [] })).toEqual([])
    expect(parseEvents({ events: [{ type: 'join' }, 1, null] })).toEqual([{ type: 'join' }])
    expect(parseEvents('x')).toEqual([])
  })
})

describe('textForBot（メンションされたときだけ返信する）', () => {
  it('Bot がメンションされていれば、メンションの部分を取り除いた文を返す', () => {
    // 「@サーブ記録 結果」の「@サーブ記録」が index 0、長さ 6
    const message = { type: 'text', text: '@サーブ記録 結果', mention: { mentionees: [{ index: 0, length: 6, isSelf: true }] } }
    expect(textForBot(message)).toBe(' 結果')
    expect(parseCommand(textForBot(message) ?? '')).toEqual({ type: 'result' })
  })

  it('文の後ろでメンションしても読める。ほかの人へのメンションは残す', () => {
    const message = {
      type: 'text',
      text: '@たろう 7番 @サーブ記録',
      mention: {
        mentionees: [
          { index: 0, length: 4 },
          { index: 8, length: 6, isSelf: true },
        ],
      },
    }
    expect(textForBot(message)).toBe('@たろう 7番 ')
  })

  it('Bot がメンションされていなければ null（ふだんの会話には反応しない）', () => {
    expect(textForBot({ type: 'text', text: '結果' })).toBeNull()
    expect(textForBot({ type: 'text', text: '@たろう 結果', mention: { mentionees: [{ index: 0, length: 4 }] } })).toBeNull()
    expect(textForBot({ type: 'text', text: '@サーブ記録 結果', mention: { mentionees: [{ index: 0, length: 6, isSelf: false }] } })).toBeNull()
    expect(textForBot(undefined)).toBeNull()
  })

  it('位置がおかしいメンションは数えない', () => {
    expect(textForBot({ type: 'text', text: '結果', mention: { mentionees: [{ index: -1, length: 3, isSelf: true }] } })).toBeNull()
    expect(textForBot({ type: 'text', text: '結果', mention: { mentionees: [{ index: 0, length: 0, isSelf: true }] } })).toBeNull()
  })
})
