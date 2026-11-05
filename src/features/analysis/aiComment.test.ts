import { describe, expect, it } from 'vitest'
import type { Match, ServeRecord, SetRecords } from '../../contracts/index.ts'
import { aiRequestOf, aiScopeKey, commentSections } from './aiComment.ts'
import type { AnalysisData } from './view.ts'

const serve = (clientId: string, setId: string, targetZone: number | null = null): ServeRecord => ({
  kind: 'serve',
  clientId,
  setId,
  serverId: 'p7',
  serveType: 'float',
  fromX: 0.5,
  toX: 0.1,
  toY: 0.1,
  result: 'ace',
  missType: null,
  reception: null,
  receiverId: null,
  targetZone,
  recordedAt: '2026-10-20T00:00:00Z',
})
const records = (setId: string, serves: ServeRecord[]): SetRecords => ({
  setId,
  serves,
  receptions: [],
  attacks: [],
  points: [],
})
const match = (id: string, date: string, kind: Match['kind'] = 'match', opponentId: string | null = 'o1'): Match => ({
  id,
  teamId: 't',
  kind,
  opponentId: kind === 'practice' ? null : opponentId,
  date,
  tournament: null,
  setPoints: 25,
})

const data: AnalysisData = {
  players: [{ id: 'p7', teamId: 't', number: 7, name: '渡辺', position: null, serveType: 'float', active: true }],
  opponents: [{ id: 'o1', teamId: 't', name: 'A高校' }],
  // 配列は新しい順にしておき、matchNo が日付の古い順になることを確かめる
  matches: [match('m2', '2026-10-27'), match('m1', '2026-10-20'), match('mp', '2026-10-21', 'practice')],
  gameSets: [
    { id: 's2', matchId: 'm2', setNo: 1, ourScore: 25, oppScore: 20 },
    { id: 's1', matchId: 'm1', setNo: 1, ourScore: 25, oppScore: 22 },
    { id: 'sp', matchId: 'mp', setNo: 1, ourScore: 0, oppScore: 0 },
  ],
  records: [records('s2', [serve('c2', 's2')]), records('s1', [serve('c1', 's1')]), records('sp', [serve('cp', 'sp', 3)])],
}

describe('aiScopeKey', () => {
  it('範囲の名前は aiReport.ts の決まりと同じ。練習は null', () => {
    expect(aiScopeKey({ kind: 'all' })).toBe('all')
    expect(aiScopeKey({ kind: 'match', matchId: 'm1' })).toBe('match:m1')
    expect(aiScopeKey({ kind: 'set', setId: 's1' })).toBe('set:s1')
    expect(aiScopeKey({ kind: 'opponent', opponentId: 'o1' })).toBe('opponent:o1')
    expect(aiScopeKey({ kind: 'practice' })).toBeNull()
  })
})

describe('aiRequestOf', () => {
  it('全体は練習を含めず、試合を日付の古い順に何試合目かで数える', () => {
    const req = aiRequestOf({ kind: 'all' }, data)
    expect(req?.scope).toBe('all')
    expect(req?.input.sets.map((s) => [s.matchNo, s.setNo, s.ourScore])).toEqual([
      [2, 1, 25],
      [1, 1, 25],
    ])
  })

  it('セットの範囲はそのセットだけ', () => {
    const req = aiRequestOf({ kind: 'set', setId: 's1' }, data)
    expect(req?.scope).toBe('set:s1')
    expect(req?.input.sets).toHaveLength(1)
    expect(req?.input.sets[0]?.records.serves[0]?.clientId).toBe('c1')
  })

  it('練習の範囲と、記録のない範囲は null', () => {
    expect(aiRequestOf({ kind: 'practice' }, data)).toBeNull()
    expect(aiRequestOf({ kind: 'match', matchId: 'none' }, data)).toBeNull()
    const empty: AnalysisData = { ...data, records: [records('s1', [])] }
    expect(aiRequestOf({ kind: 'set', setId: 's1' }, empty)).toBeNull()
  })

  it('選手の名前は送る入力に含めるのは players だけで、集計 JSON には出ない（T-31）', () => {
    const req = aiRequestOf({ kind: 'all' }, data)
    expect(req?.input.players[0]?.number).toBe(7)
  })
})

describe('commentSections', () => {
  it('【】の見出しで分ける', () => {
    const text = '【良かった点】\n・A\n【課題】\n・B\n【練習メニュー案】\n・C'
    expect(commentSections(text)).toEqual([
      { heading: '良かった点', body: '・A' },
      { heading: '課題', body: '・B' },
      { heading: '練習メニュー案', body: '・C' },
    ])
  })

  it('見出しがなければ全体を1つにし、空の節は捨てる', () => {
    expect(commentSections('全体の感想')).toEqual([{ heading: null, body: '全体の感想' }])
    expect(commentSections('【課題】\n')).toEqual([])
  })
})
