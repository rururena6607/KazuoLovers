// Edge Function gemini-report（supabase/functions）の純粋な処理と、画面側の受け取り（aiReport.ts）のテスト。
import { describe, expect, it } from 'vitest'
import {
  buildPrompt,
  canonicalJson,
  commentFromGemini,
  findPersonalData,
  parseRequest,
  startOfDayJst,
} from '../../../supabase/functions/gemini-report/logic.ts'
import { errorMessageOf, toAiComment } from './aiReport.ts'

const TEAM = '11111111-2222-4333-8444-555555555555'

/** T-31（buildAiSummary）の形に近い、背番号と数値だけの集計 */
const summary = {
  minSample: 10,
  serve: {
    total: { attempts: 42, efficiency: 12.5, aceRate: 7.1, missRate: 9.5, reference: false },
    byPlayer: [
      { number: 7, retired: false, attempts: 20, efficiency: 15, aceRate: 10, missRate: 5, reference: false },
      { number: 12, retired: false, attempts: 6, efficiency: -16.7, aceRate: 0, missRate: 33.3, reference: true },
    ],
    byType: [{ type: 'jump_float', attempts: 30, efficiency: 13.3, aceRate: 6.7, missRate: 10, reference: false }],
  },
}

describe('parseRequest', () => {
  it('チーム・範囲・集計がそろっていれば通す。force は true のときだけ', () => {
    expect(parseRequest({ teamId: TEAM, scope: 'match:m1', summary })).toEqual({
      teamId: TEAM,
      scope: 'match:m1',
      summary,
      force: false,
    })
    expect(parseRequest({ teamId: TEAM, scope: 'all', summary, force: 'yes' })).toMatchObject({ force: false })
  })

  it('形の違うものは理由を返す', () => {
    expect(parseRequest(null)).toBe('送られた内容が正しくありません。')
    expect(parseRequest({ teamId: 'abc', scope: 'all', summary })).toBe('チームの指定が正しくありません。')
    expect(parseRequest({ teamId: TEAM, scope: '', summary })).toBe('範囲の指定が正しくありません。')
    expect(parseRequest({ teamId: TEAM, scope: 'all', summary: [1] })).toBe('集計の内容が正しくありません。')
    expect(parseRequest({ teamId: TEAM, scope: 'all', summary: { x: 'a'.repeat(30_001) } })).toBe(
      '集計が大きすぎます。範囲を狭めてください。',
    )
  })
})

describe('findPersonalData（名前を Gemini に送らない）', () => {
  it('背番号と数値だけなら通す', () => {
    expect(findPersonalData(summary, ['渡辺', '佐藤'])).toBeNull()
  })

  it('選手の名前が値に入っていたら止める', () => {
    const withName = { ...summary, note: '#7 渡辺 のサーブ' }
    expect(findPersonalData(withName, ['渡辺'])).toBe('選手の名前が入っているので送れません。')
  })

  it('name などのキーがあれば、名簿になくても止める（入れ子の中も）', () => {
    const nested = { serve: { byPlayer: [{ number: 7, playerName: 'X' }] } }
    expect(findPersonalData(nested, [])).toBe('「playerName」は送れません。')
    expect(findPersonalData({ team_name: 'A' }, [])).toBe('「team_name」は送れません。')
  })

  it('1文字の名前は見ない（ほかの文字と区別できない）', () => {
    expect(findPersonalData({ type: 'jump' }, ['j'])).toBeNull()
  })
})

describe('canonicalJson', () => {
  it('キーの順が違っても同じ文字列になる（jsonb は保存するとキーの順が変わる）', () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: null }] })).toBe(canonicalJson({ a: [{ x: null, y: 2 }], b: 1 }))
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }))
  })
})

describe('buildPrompt', () => {
  it('背番号で呼ぶこと、本数が少ない項目は断定しないこと、3つの見出しを指示し、集計を渡す', () => {
    const { system, user } = buildPrompt(summary)
    expect(system).toContain('背番号')
    expect(system).toContain('10 本未満')
    expect(system).toContain('断定しない')
    for (const h of ['【良かった点】', '【課題】', '【練習メニュー案】']) expect(system).toContain(h)
    expect(user).toContain(JSON.stringify(summary))
  })
})

describe('commentFromGemini', () => {
  it('最初の候補の文をつなげる。なければ null', () => {
    const res = { candidates: [{ content: { parts: [{ text: '【良かった点】\n' }, { text: '- #7 のサーブ' }] } }] }
    expect(commentFromGemini(res)).toBe('【良かった点】\n- #7 のサーブ')
    expect(commentFromGemini({ candidates: [] })).toBeNull()
    expect(commentFromGemini({ candidates: [{ content: { parts: [{ text: '  ' }] } }] })).toBeNull()
    expect(commentFromGemini('x')).toBeNull()
  })
})

describe('startOfDayJst', () => {
  it('日本時間の 0 時を返す', () => {
    // 日本時間 10月29日 8:00 は UTC の 10月28日 23:00
    expect(startOfDayJst(new Date('2026-10-28T23:00:00Z'))).toBe('2026-10-28T15:00:00.000Z')
    // 日本時間 10月29日 0:30
    expect(startOfDayJst(new Date('2026-10-28T15:30:00Z'))).toBe('2026-10-28T15:00:00.000Z')
  })
})

describe('画面側の受け取り', () => {
  it('Edge Function の { error } をそのまま出す', async () => {
    const error = { name: 'FunctionsHttpError', context: new Response(JSON.stringify({ error: '今日は 20 回までです。' })) }
    expect(await errorMessageOf(error)).toBe('今日は 20 回までです。')
    expect(await errorMessageOf({ name: 'FunctionsFetchError' })).toBe(
      '通信できませんでした。電波のよい場所でもう一度試してください。',
    )
    expect(await errorMessageOf(new Error('x'))).toBe('AI のコメントを作れませんでした。')
  })

  it('応答の形を確かめる', () => {
    expect(toAiComment({ comment: 'a', cached: true, createdAt: '2026-10-29T00:00:00Z' })).toEqual({
      comment: 'a',
      cached: true,
      createdAt: '2026-10-29T00:00:00Z',
    })
    expect(toAiComment({ comment: 1 })).toBeNull()
  })
})
