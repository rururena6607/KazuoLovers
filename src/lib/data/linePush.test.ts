// Edge Function line-push（supabase/functions）の純粋な処理と、画面側の受け取りのテスト。
import { describe, expect, it } from 'vitest'
import { checkQuota, isOfficialMatch, quotaMessage } from '../../../supabase/functions/line-push/logic.ts'
import { toPushResult } from './linePush.ts'

describe('isOfficialMatch', () => {
  it('大会名のある試合だけを公式戦とする', () => {
    expect(isOfficialMatch({ kind: 'match', tournament: '新人戦' })).toBe(true)
    expect(isOfficialMatch({ kind: 'match', tournament: null })).toBe(false)
    expect(isOfficialMatch({ kind: 'match', tournament: '  ' })).toBe(false)
    expect(isOfficialMatch({ kind: 'practice', tournament: '新人戦' })).toBe(false)
  })
})

describe('checkQuota（通数が足りないときは送らない）', () => {
  const members = { count: 20 }

  it('残りがグループの人数以上なら送る', () => {
    expect(checkQuota({ type: 'limited', value: 200 }, { totalUsage: 180 }, members)).toEqual({
      ok: true,
      remaining: 20,
      need: 20,
    })
  })

  it('残りが人数より少なければ送らない', () => {
    expect(checkQuota({ type: 'limited', value: 200 }, { totalUsage: 181 }, members)).toEqual({
      ok: false,
      remaining: 19,
      need: 20,
    })
    // 上限を超えて使っていても、残りは 0
    expect(checkQuota({ type: 'limited', value: 200 }, { totalUsage: 250 }, members)?.remaining).toBe(0)
  })

  it('上限のないプランなら送る。グループに人がいなければ送らない', () => {
    expect(checkQuota({ type: 'none' }, null, members)).toEqual({ ok: true, remaining: null, need: 20 })
    expect(checkQuota({ type: 'limited', value: 200 }, { totalUsage: 0 }, { count: 0 })?.ok).toBe(false)
  })

  it('LINE の答えが読めなければ null（送らない）', () => {
    expect(checkQuota(null, { totalUsage: 0 }, members)).toBeNull()
    expect(checkQuota({ type: 'limited', value: 200 }, null, members)).toBeNull()
    expect(checkQuota({ type: 'limited', value: 200 }, { totalUsage: 0 }, null)).toBeNull()
  })

  it('送らなかった理由に、残りと要る通数を書く', () => {
    expect(quotaMessage({ ok: false, remaining: 19, need: 20 })).toContain('残りが 19 通で、送るのに 20 通いる')
  })
})

describe('toPushResult', () => {
  it('line-push の答えの形を確かめる', () => {
    expect(toPushResult({ sent: true, message: '送りました' })).toEqual({ sent: true, message: '送りました' })
    expect(toPushResult({ sent: 'yes' })).toBeNull()
  })
})
