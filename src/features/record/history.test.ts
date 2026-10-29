import { describe as group, expect, it } from 'vitest'
import type { PointRecord, ReceptionRecord, ServeRecord, SetRecords } from '../../contracts/index.ts'
import { DEMO_OPP_PLAYERS, DEMO_PLAYERS } from './demo.ts'
import {
  describe,
  editableGrade,
  entriesOf,
  idsToRemove,
  renumberPoints,
  withGrade,
} from './history.ts'

const t = (s: number) => `2026-10-29T10:00:${String(s).padStart(2, '0')}.000Z`

const serve = (over: Partial<ServeRecord>): ServeRecord => ({
  kind: 'serve',
  clientId: 'sv',
  setId: 's1',
  serverId: 'p7',
  serveType: 'jump',
  fromX: null,
  toX: null,
  toY: null,
  result: 'in',
  missType: null,
  reception: 'C',
  receiverId: null,
  targetZone: null,
  recordedAt: t(0),
  ...over,
})

const reception = (over: Partial<ReceptionRecord>): ReceptionRecord => ({
  kind: 'reception',
  clientId: 'rc',
  setId: 's1',
  receiverId: 'p12',
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result: 'A',
  recordedAt: t(0),
  ...over,
})

const point = (over: Partial<PointRecord>): PointRecord => ({
  kind: 'point',
  clientId: 'pt',
  setId: 's1',
  side: 'us',
  cause: 'manual',
  sourceId: null,
  ourScore: 0,
  oppScore: 0,
  recordedAt: t(0),
  ...over,
})

group('describe', () => {
  const d = (e: Parameters<typeof describe>[0]) => describe(e, DEMO_PLAYERS, DEMO_OPP_PLAYERS)

  it('要件定義書の例：#7 → #12 C · Z1', () => {
    // 相手コートの奥の左（x 0.1, y 0.9）はゾーン 1
    expect(d(serve({ receiverId: 'o12', toX: 0.1, toY: 0.9 }))).toBe('#7 → #12 C · Z1')
  })
  it('エースとミス', () => {
    expect(d(serve({ result: 'ace', reception: null }))).toBe('#7 エース')
    expect(d(serve({ result: 'miss', reception: null, missType: 'net' }))).toBe('#7 ミス(ネット)')
  })
  it('レシーブと相手ミス', () => {
    expect(d(reception({ oppServerId: 'o9', result: 'B' }))).toBe('#9 → #12 B')
    expect(d(reception({ result: 'ace' }))).toBe('受 #12 被エース')
    expect(d(reception({ result: 'opp_miss', receiverId: null }))).toBe('相手ミス')
  })
  it('手動の得点', () => {
    expect(d(point({ side: 'opp', ourScore: 3, oppScore: 5 }))).toBe('+1 相手（3-5）')
  })
})

group('entriesOf / idsToRemove', () => {
  const sv = serve({ clientId: 'sv1', result: 'ace', reception: null, recordedAt: t(1) })
  const auto = point({ clientId: 'pt1', sourceId: 'sv1', recordedAt: t(2) })
  const manual = point({ clientId: 'pt2', recordedAt: t(3) })
  const set: SetRecords = { setId: 's1', serves: [sv], receptions: [], attacks: [], points: [auto, manual] }

  it('自動の得点は並べず、手動の得点は並べる', () => {
    expect(entriesOf(set).map((e) => e.clientId)).toEqual(['sv1', 'pt2'])
  })
  it('1本を消すと、その得点も消す', () => {
    expect(idsToRemove(sv, set.points)).toEqual(['sv1', 'pt1'])
    expect(idsToRemove(manual, set.points)).toEqual(['pt2'])
  })
})

group('renumberPoints', () => {
  it('途中が消えたら、あとの得点を付け直す', () => {
    const a = point({ clientId: 'a', side: 'us', ourScore: 1, oppScore: 0, recordedAt: t(1) })
    const c = point({ clientId: 'c', side: 'opp', ourScore: 2, oppScore: 1, recordedAt: t(3) })
    expect(renumberPoints([a, c])).toEqual([{ ...c, ourScore: 1, oppScore: 1 }])
  })
})

group('editableGrade / withGrade', () => {
  it('インのサーブと A〜D のレシーブだけ評価を直せる', () => {
    expect(editableGrade(serve({}))).toBe('C')
    expect(editableGrade(serve({ result: 'ace', reception: null }))).toBeNull()
    expect(editableGrade(reception({ result: 'opp_miss' }))).toBeNull()
    expect(withGrade(reception({}), 'D')).toMatchObject({ result: 'D' })
    expect(withGrade(serve({}), 'A')).toMatchObject({ reception: 'A' })
  })
})
