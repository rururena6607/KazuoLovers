// teamData の updateColSplits・addScrimmagePlayer（MatchRepository、T-48）。
// 本物の Supabase の代わりに、メモリ上の表を使う最小限の偽のクライアントで、送る内容と結果を確かめる。
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseTeamData } from './teamData.ts'

type Row = Record<string, unknown>
type Err = { message: string; code?: string }

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  onConflict?: string
  payload?: Row
  filters: [string, unknown][]
}

/**
 * teamData が使う呼び方（from → select / insert / update → eq → single か、そのまま待つ）だけを持つ偽のクライアント。
 * (opponent_id, number) の一意制約も真似る
 */
function fakeClient(tables: Record<string, Row[]>, failInsert: readonly string[] = []) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      calls.push(call)
      const matching = () => tables[table]?.filter((r) => call.filters.every(([k, v]) => r[k] === v)) ?? []
      const run = (): { data: Row[] | null; error: Err | null } => {
        if (call.op === 'upsert') {
          // onConflict の列が同じ行があれば、それを返す（ないときだけ足す）
          const cols = (call.onConflict ?? '').split(',')
          const same = tables[table]?.find((r) => cols.every((c) => r[c] === call.payload?.[c]))
          if (same) return { data: [same], error: null }
          call.op = 'insert'
        }
        if (call.op === 'delete') {
          const rows = matching()
          tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r))
          return { data: rows, error: null }
        }
        if (call.op === 'insert' && failInsert.includes(table)) {
          return { data: null, error: { message: 'insert failed', code: '23514' } }
        }
        if (call.op === 'insert') {
          // 本物の DB は、入れなかった列を null で返す
          const defaults: Row =
            table === 'opponent_players'
              ? { player_id: null }
              : table === 'sets'
                ? { our_score: 0, opp_score: 0, col_split_1: null, col_split_2: null }
                : table === 'matches'
                  ? { date: '2026-11-05', tournament: null, set_points: 25, kind: 'match', opponent_id: null }
                  : {}
          const row: Row = { ...defaults, ...call.payload }
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
        upsert: (payload: Row, opts?: { onConflict?: string }) =>
          ((call.op = 'upsert'), (call.payload = payload), (call.onConflict = opts?.onConflict), builder),
        delete: () => ((call.op = 'delete'), builder),
        order: () => builder,
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

describe('addOpponentPlayer（F-04・F-27）', () => {
  const players = (): Row[] => [
    { id: 'p8', number: 8 },
    { id: 'p9', number: 9 },
  ]

  it('playerId なし：背番号だけで足す。同じ背番号がすでにあれば、それを返す（これまでどおり）', async () => {
    const { client } = fakeClient({ opponent_players: [] })
    const data = createSupabaseTeamData(() => client)
    const first = await data.addOpponentPlayer('o1', 12)
    expect(first).toMatchObject({ opponentId: 'o1', number: 12 })
    expect(first).not.toHaveProperty('playerId')
    const again = await data.addOpponentPlayer('o1', 12)
    expect(again.id).toBe(first.id)
  })

  it('紅白戦：B チームに部員を、渡した背番号で入れる（player_id つき）', async () => {
    const { client, calls } = fakeClient({ players: players(), opponent_players: [] })
    const added = await createSupabaseTeamData(() => client).addOpponentPlayer('o-b', 8, 'p8')
    expect(added).toMatchObject({ opponentId: 'o-b', number: 8, playerId: 'p8' })
    expect(calls.find((c) => c.op === 'insert')?.payload).toEqual({ opponent_id: 'o-b', number: 8, player_id: 'p8' })
  })

  it('紅白戦：すでに入っている部員は、足さずにそれを返す', async () => {
    const existing = { id: 'op1', opponent_id: 'o-b', number: 8, player_id: 'p8' }
    const { client, calls } = fakeClient({ players: players(), opponent_players: [existing] })
    const again = await createSupabaseTeamData(() => client).addOpponentPlayer('o-b', 8, 'p8')
    expect(again).toMatchObject({ id: 'op1', playerId: 'p8' })
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('紅白戦：B チームの別の選手と背番号が重なるときは、足せない（一意制約）。黙ってその選手を返さない', async () => {
    const other = { id: 'op2', opponent_id: 'o-b', number: 8, player_id: 'p-other' }
    const { client } = fakeClient({ players: players(), opponent_players: [other] })
    await expect(createSupabaseTeamData(() => client).addOpponentPlayer('o-b', 8, 'p8')).rejects.toThrow('重なっています')
  })

  it('背番号が 0〜99 でなければ、送らずに断る', async () => {
    const { client, calls } = fakeClient({ players: players(), opponent_players: [] })
    await expect(createSupabaseTeamData(() => client).addOpponentPlayer('o-b', 100, 'p8')).rejects.toThrow('0〜99')
    expect(calls).toHaveLength(0)
  })
})

const matchInput = { date: '2026-11-05', tournament: null, setPoints: 25 }

describe('紅白戦の作成（F-27）', () => {
  it('B チームを自動で作って、試合に付ける。第1セットも作る', async () => {
    const tables: Record<string, Row[]> = { opponents: [], matches: [], sets: [] }
    const { client } = fakeClient(tables)
    const { match, firstSet } = await createSupabaseTeamData(() => client).createMatch('t1', {
      ...matchInput,
      kind: 'scrimmage',
      opponentId: null,
    })
    expect(tables.opponents).toHaveLength(1)
    expect(tables.opponents?.[0]).toMatchObject({ team_id: 't1', name: '紅白戦（B チーム）' })
    expect(match).toMatchObject({ kind: 'scrimmage', opponentId: tables.opponents?.[0]?.id })
    expect(firstSet).toMatchObject({ matchId: match.id, setNo: 1 })
  })

  it('紅白戦を 2 回作ると、B チームも 2 つ（試合ごと。使い回さない）', async () => {
    const tables: Record<string, Row[]> = { opponents: [], matches: [], sets: [] }
    const data = createSupabaseTeamData(() => fakeClient(tables).client)
    const a = await data.createMatch('t1', { ...matchInput, kind: 'scrimmage', opponentId: null })
    const b = await data.createMatch('t1', { ...matchInput, kind: 'scrimmage', opponentId: null })
    expect(a.match.opponentId).not.toBe(b.match.opponentId)
    expect(tables.opponents).toHaveLength(2)
  })

  it('ふつうの試合・練習では、B チームを作らない', async () => {
    const tables: Record<string, Row[]> = { opponents: [], matches: [], sets: [] }
    const data = createSupabaseTeamData(() => fakeClient(tables).client)
    await data.createMatch('t1', { ...matchInput, kind: 'match', opponentId: 'o1' })
    await data.createMatch('t1', { ...matchInput, kind: 'practice', opponentId: null })
    expect(tables.opponents).toHaveLength(0)
  })

  it('試合を作れなかったら、さっき作った B チームを残さない', async () => {
    const tables: Record<string, Row[]> = { opponents: [], matches: [], sets: [] }
    const { client } = fakeClient(tables, ['matches'])
    await expect(
      createSupabaseTeamData(() => client).createMatch('t1', { ...matchInput, kind: 'scrimmage', opponentId: null }),
    ).rejects.toThrow()
    expect(tables.opponents).toHaveLength(0)
  })

  it('相手チームの一覧に、紅白戦の B チームは出さない', async () => {
    const tables: Record<string, Row[]> = {
      opponents: [
        { id: 'o1', team_id: 't1', name: '熊本工業' },
        { id: 'o-b', team_id: 't1', name: '紅白戦（B チーム）' },
      ],
      matches: [
        { id: 'm1', team_id: 't1', kind: 'match', opponent_id: 'o1' },
        { id: 'm2', team_id: 't1', kind: 'scrimmage', opponent_id: 'o-b' },
      ],
    }
    const list = await createSupabaseTeamData(() => fakeClient(tables).client).listOpponents('t1')
    expect(list.map((o) => o.name)).toEqual(['熊本工業'])
  })
})

describe('deleteMatch（試合・練習・紅白戦の削除）', () => {
  const base = (): Record<string, Row[]> => ({
    opponents: [
      { id: 'o1', team_id: 't1', name: '熊本工業' },
      { id: 'o-b', team_id: 't1', name: '紅白戦（B チーム）' },
    ],
    matches: [
      { id: 'm-match', kind: 'match', opponent_id: 'o1' },
      { id: 'm-prac', kind: 'practice', opponent_id: null },
      { id: 'm-scrim', kind: 'scrimmage', opponent_id: 'o-b' },
    ],
  })

  it('試合を消す。相手チームは残す（ほかの試合でも使う）', async () => {
    const tables = base()
    await createSupabaseTeamData(() => fakeClient(tables).client).deleteMatch('m-match')
    expect(tables.matches?.map((m) => m.id)).toEqual(['m-prac', 'm-scrim'])
    expect(tables.opponents).toHaveLength(2)
  })

  it('練習を消す', async () => {
    const tables = base()
    await createSupabaseTeamData(() => fakeClient(tables).client).deleteMatch('m-prac')
    expect(tables.matches?.map((m) => m.id)).toEqual(['m-match', 'm-scrim'])
  })

  it('紅白戦を消すと、B チームもいっしょに消す', async () => {
    const tables = base()
    await createSupabaseTeamData(() => fakeClient(tables).client).deleteMatch('m-scrim')
    expect(tables.matches?.map((m) => m.id)).toEqual(['m-match', 'm-prac'])
    expect(tables.opponents?.map((o) => o.id)).toEqual(['o1'])
  })

  it('B チームをほかの試合が使っていれば、B チームは残す', async () => {
    const tables = base()
    tables.matches?.push({ id: 'm-scrim2', kind: 'scrimmage', opponent_id: 'o-b' })
    await createSupabaseTeamData(() => fakeClient(tables).client).deleteMatch('m-scrim')
    expect(tables.opponents?.map((o) => o.id)).toContain('o-b')
  })

  it('ない試合（または権限のない試合）は、消したことにしない', async () => {
    const tables = base()
    await expect(createSupabaseTeamData(() => fakeClient(tables).client).deleteMatch('nothing')).rejects.toThrow()
    expect(tables.matches).toHaveLength(3)
  })
})
