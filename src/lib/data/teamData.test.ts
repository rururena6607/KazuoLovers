// teamData の updateColSplits・addScrimmagePlayer（MatchRepository、T-48）。
// 本物の Supabase の代わりに、メモリ上の表を使う最小限の偽のクライアントで、送る内容と結果を確かめる。
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseTeamData } from './teamData.ts'

type Row = Record<string, unknown>
type Err = { message: string; code?: string }

interface Call {
  table: string
  op: 'select' | 'insert' | 'update'
  payload?: Row
  filters: [string, unknown][]
}

/**
 * teamData が使う呼び方（from → select / insert / update → eq → single か、そのまま待つ）だけを持つ偽のクライアント。
 * (opponent_id, number) の一意制約も真似る
 */
function fakeClient(tables: Record<string, Row[]>) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      calls.push(call)
      const matching = () => tables[table]?.filter((r) => call.filters.every(([k, v]) => r[k] === v)) ?? []
      const run = (): { data: Row[] | null; error: Err | null } => {
        if (call.op === 'insert') {
          const row = { ...call.payload }
          const dup = table === 'opponent_players' &&
            tables[table]?.some((r) => r.opponent_id === row.opponent_id && r.number === row.number)
          if (dup) return { data: null, error: { message: 'duplicate key', code: '23505' } }
          const inserted = { id: `new-${tables[table]?.length ?? 0}`, ...row }
          tables[table]?.push(inserted)
          return { data: [inserted], error: null }
        }
        const rows = matching()
        if (call.op === 'update') for (const r of rows) Object.assign(r, call.payload)
        return { data: rows, error: null }
      }
      const builder = {
        select: () => builder,
        insert: (payload: Row) => ((call.op = 'insert'), (call.payload = payload), builder),
        update: (payload: Row) => ((call.op = 'update'), (call.payload = payload), builder),
        eq: (k: string, v: unknown) => (call.filters.push([k, v]), builder),
        returns: () => builder,
        single: () => {
          const res = run()
          if (res.error) return Promise.resolve(res)
          if (res.data?.length !== 1) {
            return Promise.resolve({ data: null, error: { message: 'JSON object requested', code: 'PGRST116' } })
          }
          return Promise.resolve({ data: res.data[0], error: null })
        },
        then: (ok: (r: unknown) => unknown, ng?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ng),
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const set = (id: string): Row => ({ id, match_id: 'm1', set_no: 1, our_score: 3, opp_score: 2, col_split_1: null, col_split_2: null })

describe('updateColSplits（F-24）', () => {
  it('列の境目を保存し、保存したセットを返す（得点などはそのまま）', async () => {
    const { client, calls } = fakeClient({ sets: [set('s1')] })
    const data = createSupabaseTeamData(() => client)
    const saved = await data.updateColSplits('s1', 0.3, 0.7)
    expect(saved).toEqual({ id: 's1', matchId: 'm1', setNo: 1, ourScore: 3, oppScore: 2, colSplit1: 0.3, colSplit2: 0.7 })
    const update = calls.find((c) => c.op === 'update')
    expect(update).toMatchObject({ table: 'sets', payload: { col_split_1: 0.3, col_split_2: 0.7 }, filters: [['id', 's1']] })
  })

  it('範囲外・逆順・等しい値は、送らずに断る', async () => {
    const { client, calls } = fakeClient({ sets: [set('s1')] })
    const data = createSupabaseTeamData(() => client)
    await expect(data.updateColSplits('s1', 0.7, 0.3)).rejects.toThrow('左の境目')
    await expect(data.updateColSplits('s1', 0.5, 0.5)).rejects.toThrow()
    await expect(data.updateColSplits('s1', -0.1, 0.5)).rejects.toThrow('0〜1')
    await expect(data.updateColSplits('s1', 0.2, 1.2)).rejects.toThrow('0〜1')
    await expect(data.updateColSplits('s1', Number.NaN, 0.5)).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('ないセット（または権限のないセット）は、保存したことにしない', async () => {
    const { client } = fakeClient({ sets: [set('s1')] })
    await expect(createSupabaseTeamData(() => client).updateColSplits('nothing', 0.3, 0.7)).rejects.toThrow()
  })
})

describe('addScrimmagePlayer（F-27）', () => {
  const players = (): Row[] => [
    { id: 'p8', number: 8 },
    { id: 'p9', number: 9 },
  ]

  it('B チームに、自チームの選手を、その選手の背番号で入れる（player_id つき）', async () => {
    const { client, calls } = fakeClient({ players: players(), opponent_players: [] })
    const added = await createSupabaseTeamData(() => client).addScrimmagePlayer('o-b', 'p8')
    expect(added).toMatchObject({ opponentId: 'o-b', number: 8, playerId: 'p8' })
    expect(calls.find((c) => c.op === 'insert')?.payload).toEqual({ opponent_id: 'o-b', number: 8, player_id: 'p8' })
  })

  it('すでに入っている選手は、足さずにそれを返す', async () => {
    const existing = { id: 'op1', opponent_id: 'o-b', number: 8, player_id: 'p8' }
    const { client, calls } = fakeClient({ players: players(), opponent_players: [existing] })
    const again = await createSupabaseTeamData(() => client).addScrimmagePlayer('o-b', 'p8')
    expect(again).toMatchObject({ id: 'op1', playerId: 'p8' })
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('B チームの別の選手と背番号が重なるときは、足せない（一意制約）', async () => {
    const other = { id: 'op2', opponent_id: 'o-b', number: 8, player_id: 'p-other' }
    const { client } = fakeClient({ players: players(), opponent_players: [other] })
    await expect(createSupabaseTeamData(() => client).addScrimmagePlayer('o-b', 'p8')).rejects.toThrow('重なっています')
  })

  it('ない選手は足せない', async () => {
    const { client } = fakeClient({ players: players(), opponent_players: [] })
    await expect(createSupabaseTeamData(() => client).addScrimmagePlayer('o-b', 'nobody')).rejects.toThrow()
  })
})
