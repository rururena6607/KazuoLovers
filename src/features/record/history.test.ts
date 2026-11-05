import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  OppAttackRecord,
  PointRecord,
  ReceptionRecord,
  ServeRecord,
  SetRecords,
} from '../../contracts/index.ts'
import { DEMO_OPP_PLAYERS, DEMO_PLAYERS } from './demo.ts'
import {
  describeEntry,
  editableGrade,
  entriesOf,
  idsToRemove,
  relinkAttacks,
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
const attack = (over: Partial<AttackRecord>): AttackRecord => ({
  kind: 'attack',
  clientId: 'at',
  setId: 's1',
  attackerId: 'p7',
  attackType: null,
  isBack: false,
  toX: null,
  toY: null,
  result: 'kill',
  prevReception: null,
  recordedAt: t(0),
  ...over,
})

const dig = (over: Partial<OppAttackRecord>): OppAttackRecord => ({
  kind: 'opp_attack',
  clientId: 'dg',
  setId: 's1',
  hitterId: null,
  diggerId: 'p7',
  fromX: null,
  fromY: null,
  toX: null,
  toY: null,
  speed: null,
  result: 'A',
  recordedAt: t(0),
  ...over,
})

describe('describeEntry', () => {
  const d = (e: Parameters<typeof describeEntry>[0]) => describeEntry(e, DEMO_PLAYERS, DEMO_OPP_PLAYERS)

  it('要件定義書の例：#7 → #12 C · Z1', () => {
    // 相手コートの奥の左（x 0.1, y 0.9）はゾーン 1
    expect(d(serve({ receiverId: 'o12', toX: 0.1, toY: 0.9 }))).toBe('#7 → #12 C · Z1')
  })
  it('エースとミス', () => {
    expect(d(serve({ result: 'ace', reception: null }))).toBe('#7 エース')
    expect(d(serve({ result: 'miss', reception: null, missType: 'net' }))).toBe('#7 ミス(ネット)')
  })
  it('ミスの種類がなければ「ミス」だけ', () => {
    expect(d(serve({ result: 'miss', reception: null, missType: null }))).toBe('#7 ミス')
  })
  it('名簿にいないサーバーは「?」', () => {
    expect(d(serve({ serverId: 'gone', receiverId: 'o12' }))).toBe('? → #12 C')
  })
  it('レシーブと相手ミス', () => {
    expect(d(reception({ oppServerId: 'o9', result: 'B' }))).toBe('#9 → #12 B')
    expect(d(reception({ result: 'ace' }))).toBe('受 #12 被エース')
    expect(d(reception({ result: 'opp_miss', receiverId: null }))).toBe('相手ミス')
  })
  it('アタック', () => {
    expect(d(attack({ attackType: 'back', isBack: true, result: 'blocked' }))).toBe(
      '#7 バックアタック 被ブロック',
    )
  })
  it('手動の得点（点数は出さない）', () => {
    expect(d(point({ side: 'opp', ourScore: 3, oppScore: 5 }))).toBe('+1 相手')
  })
})

describe('entriesOf / idsToRemove', () => {
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

describe('relinkAttacks', () => {
  it('レシーブの評価を直したら、直後のアタックの prevReception も直す', () => {
    const rc = reception({ clientId: 'rc', result: 'C', recordedAt: t(1) })
    const at = attack({ clientId: 'at', prevReception: 'B', recordedAt: t(2) })
    expect(relinkAttacks([rc, at])).toEqual([{ ...at, prevReception: 'C' }])
  })
  it('レシーブを消したら、残ったアタックの prevReception を外す', () => {
    const at = attack({ clientId: 'at', prevReception: 'B', recordedAt: t(2) })
    expect(relinkAttacks([at])).toEqual([{ ...at, prevReception: null }])
  })
  it('切り返し（アタックのあとのアタック）は null のまま', () => {
    const rc = reception({ result: 'A', recordedAt: t(1) })
    const a1 = attack({ clientId: 'a1', prevReception: 'A', result: 'continue', recordedAt: t(2) })
    const a2 = attack({ clientId: 'a2', prevReception: null, recordedAt: t(3) })
    expect(relinkAttacks([rc, a1, a2])).toEqual([])
  })
})

describe('editableGrade / withGrade', () => {
  it('インのサーブと A〜D のレシーブだけ評価を直せる', () => {
    expect(editableGrade(serve({}))).toBe('C')
    expect(editableGrade(serve({ result: 'ace', reception: null }))).toBeNull()
    expect(editableGrade(reception({ result: 'opp_miss' }))).toBeNull()
    expect(withGrade(reception({}), 'D')).toMatchObject({ result: 'D' })
    expect(withGrade(serve({}), 'A')).toMatchObject({ reception: 'A' })
  })
})

describe('相手のスパイク（F-25）', () => {
  it('一覧に時刻順で並び、拾えず・相手ミスはその得点もいっしょに消す', () => {
    const sv = serve({ clientId: 'sv1', recordedAt: t(1) })
    const dg = dig({ clientId: 'dg1', result: 'killed', recordedAt: t(2) })
    const auto = point({ clientId: 'pt1', side: 'opp', cause: 'opp_kill', sourceId: 'dg1', recordedAt: t(3) })
    const set: SetRecords = {
      setId: 's1',
      serves: [sv],
      receptions: [],
      attacks: [],
      oppAttacks: [dg],
      points: [auto],
    }
    expect(entriesOf(set).map((e) => e.clientId)).toEqual(['sv1', 'dg1'])
    expect(idsToRemove(dg, set.points)).toEqual(['dg1', 'pt1'])
  })
  it('oppAttacks がない古いデータでも一覧を作れる', () => {
    const set: SetRecords = { setId: 's1', serves: [], receptions: [], attacks: [], points: [] }
    expect(entriesOf(set)).toEqual([])
  })
  it('拾った評価（A〜D）だけ直せる。拾えず・相手ミスは得点が変わるので直せない', () => {
    expect(editableGrade(dig({ result: 'B' }))).toBe('B')
    expect(editableGrade(dig({ result: 'killed' }))).toBeNull()
    expect(editableGrade(dig({ result: 'opp_error' }))).toBeNull()
    expect(withGrade(dig({ result: 'B' }), 'D')).toMatchObject({ result: 'D' })
    expect(withGrade(dig({ result: 'killed' }), 'D')).toMatchObject({ result: 'killed' })
  })
  it('拾ったあとのアタックは切り返しなので prevReception は null（7 章）', () => {
    const dg = dig({ result: 'A', recordedAt: t(1) })
    const at = attack({ clientId: 'at', prevReception: 'A', recordedAt: t(2) })
    expect(relinkAttacks([dg, at])).toEqual([{ ...at, prevReception: null }])
  })
})
