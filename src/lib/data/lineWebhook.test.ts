// Edge Function line-webhook（supabase/functions）の純粋な処理のテスト。
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MAX_TEXT_LENGTH,
  formatPlayerCounts,
  formatResult,
  parseCommand,
  parseEvents,
  setScoreFromPoints,
  verifySignature,
} from '../../../supabase/functions/line-webhook/logic.ts'

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

describe('formatResult', () => {
  it('日付・相手・大会、セットの取った数、セットごとの得点、AI コメントを返す', () => {
    const texts = formatResult({
      date: '2026-10-29',
      opponentName: '熊本工業',
      tournament: '新人戦',
      sets: [
        { setNo: 1, ourScore: 25, oppScore: 22 },
        { setNo: 2, ourScore: 19, oppScore: 25 },
        { setNo: 3, ourScore: 25, oppScore: 17 },
      ],
      aiComment: '【良かった点】…',
    })
    expect(texts).toEqual([
      '2026-10-29 vs 熊本工業 新人戦\nセット 2-1\n25-22 / 19-25 / 25-17',
      'AI のコメント\n【良かった点】…',
    ])
  })

  it('得点も AI コメントもまだなければ、そう伝える。長すぎる文は切る', () => {
    const texts = formatResult({ date: '2026-10-29', opponentName: null, tournament: null, sets: [], aiComment: null })
    expect(texts[0]).toBe('2026-10-29 練習\nまだ得点の記録がありません')
    expect(texts[1]).toContain('まだありません')
    const long = formatResult({ date: 'd', opponentName: null, tournament: null, sets: [], aiComment: 'あ'.repeat(6000) })
    expect(long[1]?.length).toBe(MAX_TEXT_LENGTH)
  })
})

describe('formatPlayerCounts', () => {
  it('背番号と本数を返す（指標は T-34）', () => {
    expect(formatPlayerCounts({ number: 7, date: '2026-10-29', serves: 18, receptions: 9, attacks: 12 })).toBe(
      '#7（2026-10-29 の試合）\nサーブ 18本\nレシーブ 9本\nアタック 12本',
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
