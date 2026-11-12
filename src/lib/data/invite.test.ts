// 招待コード（T-43、F-02）：コードの整え方・形の確かめ方、サーバーの返事の読み方、teamData が送る内容。
// SQL の動き（参加で前のチームから抜ける・消える）は supabase/tests/rls_check_invite.sql で確かめる。
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  checkInviteCode,
  inviteInfoFromRow,
  joinPreviewFromRow,
  normalizeInviteCode,
  teamFromJoinRow,
} from './invite.ts'
import { createSupabaseTeamData } from './teamData.ts'

describe('normalizeInviteCode', () => {
  it('小文字・空白・ハイフン・全角を、発行したときの形に戻す', () => {
    expect(normalizeInviteCode('abcd-efgh')).toBe('ABCDEFGH')
    expect(normalizeInviteCode(' AB CD\tEF GH ')).toBe('ABCDEFGH')
    expect(normalizeInviteCode('ＡＢＣＤ－２３４５')).toBe('ABCD2345')
    expect(normalizeInviteCode('abcdーefgh')).toBe('ABCDEFGH')
  })
})

describe('checkInviteCode', () => {
  it('8 文字で、0・O・1・I を含まないコードは通す', () => {
    expect(checkInviteCode('ABCD2345')).toBeNull()
    expect(checkInviteCode('ZZZZ9999')).toBeNull()
  })

  it('長さが違う・使わない文字があると、理由を返す', () => {
    expect(checkInviteCode('ABCD234')).not.toBeNull()
    expect(checkInviteCode('ABCD23456')).not.toBeNull()
    expect(checkInviteCode('ABCD2340')).not.toBeNull()
    expect(checkInviteCode('ABCD234O')).not.toBeNull()
    expect(checkInviteCode('ABCD2341')).not.toBeNull()
    expect(checkInviteCode('ABCD234I')).not.toBeNull()
    expect(checkInviteCode('')).not.toBeNull()
  })
})

describe('サーバーの返事の読み方', () => {
  it('参加前の確認', () => {
    expect(joinPreviewFromRow({ team_name: 'B', leaving: ['A'], deleting: [] })).toEqual({
      teamName: 'B',
      leaving: ['A'],
      deleting: [],
    })
    expect(() => joinPreviewFromRow({ team_name: 'B', leaving: null, deleting: [] })).toThrow()
    expect(() => joinPreviewFromRow(null)).toThrow()
  })

  it('招待コードの情報（部員はコードが null）', () => {
    expect(inviteInfoFromRow({ is_admin: true, code: 'ABCD2345' })).toEqual({ isAdmin: true, code: 'ABCD2345' })
    expect(inviteInfoFromRow({ is_admin: false, code: null })).toEqual({ isAdmin: false, code: null })
    expect(() => inviteInfoFromRow({ is_admin: 'yes', code: null })).toThrow()
  })

  it('参加したチーム', () => {
    expect(teamFromJoinRow({ id: 't1', name: 'B' })).toEqual({ id: 't1', name: 'B' })
    expect(() => teamFromJoinRow({ id: 't1' })).toThrow()
  })
})

/** rpc だけを持つ偽のクライアント。呼ばれた関数と引数を残し、決めた返事を返す */
function fakeRpc(reply: (fn: string) => { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      return Promise.resolve(reply(fn))
    },
  }
  return { calls, data: createSupabaseTeamData(() => client as unknown as SupabaseClient) }
}

describe('teamData の招待コード', () => {
  it('参加の確認と参加には、整えたコードを送る。消してよいかも送る', async () => {
    const { calls, data } = fakeRpc((fn) =>
      fn === 'preview_join'
        ? { data: { team_name: 'B', leaving: [], deleting: ['A'] }, error: null }
        : { data: { id: 't1', name: 'B' }, error: null },
    )
    await expect(data.previewJoin('abcd-2345')).resolves.toEqual({ teamName: 'B', leaving: [], deleting: ['A'] })
    await expect(data.joinTeam('abcd 2345', true)).resolves.toEqual({ id: 't1', name: 'B' })
    expect(calls).toEqual([
      { fn: 'preview_join', args: { code: 'ABCD2345' } },
      { fn: 'join_team', args: { code: 'ABCD2345', allow_delete: true } },
    ])
  })

  it('形の違うコードは、サーバーに送らずに断る', async () => {
    const { calls, data } = fakeRpc(() => ({ data: null, error: null }))
    await expect(data.previewJoin('abc')).rejects.toThrow('8 文字')
    await expect(data.joinTeam('abc', false)).rejects.toThrow('8 文字')
    expect(calls).toEqual([])
  })

  it('サーバーが出した理由（コードが見つからないなど）を、そのまま見せる', async () => {
    const { data } = fakeRpc(() => ({
      data: null,
      error: { message: '招待コードが見つかりません。管理者に、いまのコードを確かめてください', code: 'P0001' },
    }))
    await expect(data.previewJoin('ABCD2345')).rejects.toThrow(
      '招待コードが見つかりません。管理者に、いまのコードを確かめてください。',
    )
  })

  it('発行と、コードの情報', async () => {
    const { calls, data } = fakeRpc((fn) =>
      fn === 'regenerate_invite_code'
        ? { data: 'ZZZZ9999', error: null }
        : { data: { is_admin: true, code: 'ZZZZ9999' }, error: null },
    )
    await expect(data.regenerateInviteCode('t1')).resolves.toBe('ZZZZ9999')
    await expect(data.inviteInfo('t1')).resolves.toEqual({ isAdmin: true, code: 'ZZZZ9999' })
    expect(calls).toEqual([
      { fn: 'regenerate_invite_code', args: { t: 't1' } },
      { fn: 'invite_info', args: { t: 't1' } },
    ])
  })

  it('部員が発行しようとすると、権限がないと出る', async () => {
    const { data } = fakeRpc(() => ({ data: null, error: { message: 'x', code: '42501' } }))
    await expect(data.regenerateInviteCode('t1')).rejects.toThrow('権限がありません')
  })
})
