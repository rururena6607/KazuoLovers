import { describe, expect, it } from 'vitest'
import type { AttackRecord, OppAttackRecord, ReceptionRecord, ServeRecord } from '../../contracts/index.ts'
import {
  buildAttack,
  emptyAttackDraft,
  prevReceptionOf,
  rallyTurnOf,
  withArrowTap,
  withAttackType,
  type AttackDraft,
} from './attack.ts'

const ids = { clientId: 'a1', setId: 's1', recordedAt: '2026-10-29T10:00:05.000Z' }
const t = (s: number) => `2026-10-29T10:00:${String(s).padStart(2, '0')}.000Z`

const reception = (result: ReceptionRecord['result'], s: number): ReceptionRecord => ({
  kind: 'reception',
  clientId: `r${s}`,
  setId: 's1',
  receiverId: 'p12',
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result,
  recordedAt: t(s),
})

const serveIn = (s: number): ServeRecord => ({
  kind: 'serve',
  clientId: `s${s}`,
  setId: 's1',
  serverId: 'p7',
  serveType: 'jump',
  fromX: null,
  toX: null,
  toY: null,
  result: 'in',
  missType: null,
  reception: 'B',
  receiverId: null,
  targetZone: null,
  recordedAt: t(s),
})

describe('prevReceptionOf', () => {
  it('直前が自チームの A〜D のレシーブなら、その評価', () => {
    expect(prevReceptionOf(reception('B', 1))).toBe('B')
  })
  it('自チームのサーブのあと（相手の攻撃からの切り返し）は null', () => {
    expect(prevReceptionOf(serveIn(1))).toBeNull()
    expect(prevReceptionOf(null)).toBeNull()
  })
  it('アタックの継続のあとは null', () => {
    const cont: AttackRecord = {
      kind: 'attack',
      clientId: 'a0',
      setId: 's1',
      attackerId: 'p7',
      attackType: null,
      isBack: false,
      toX: null,
      toY: null,
      result: 'continue',
      prevReception: 'B',
      recordedAt: t(2),
    }
    expect(prevReceptionOf(cont)).toBeNull()
  })
})

describe('buildAttack', () => {
  const draft: AttackDraft = {
    ...emptyAttackDraft(),
    attackerId: 'p7',
    attackType: 'left',
    to: { x: 0.3, y: 0.6 },
  }

  it('打った選手がいなければ作らない', () => {
    expect(buildAttack(emptyAttackDraft(), 'kill', null, ids)).toBeNull()
  })
  it('結果・方向・前のレシーブの評価を残す', () => {
    expect(buildAttack(draft, 'kill', 'A', ids)).toMatchObject({
      attackerId: 'p7',
      attackType: 'left',
      isBack: false,
      toX: 0.3,
      toY: 0.6,
      result: 'kill',
      prevReception: 'A',
    })
  })
  it('矢印（打った位置・方向）と速さを残す。入れなければ null（F-20・F-26）', () => {
    const arrow = { ...draft, from: { x: 0.8, y: 0.2 }, speed: 'fast' as const }
    expect(buildAttack(arrow, 'kill', null, ids)).toMatchObject({
      fromX: 0.8,
      fromY: 0.2,
      toX: 0.3,
      toY: 0.6,
      speed: 'fast',
    })
    expect(buildAttack(draft, 'kill', null, ids)).toMatchObject({ fromX: null, fromY: null, speed: null })
  })
  it('バックアタックかどうかは下書きの isBack だけで決める', () => {
    expect(buildAttack({ ...draft, isBack: true }, 'error', null, ids)?.isBack).toBe(true)
    expect(buildAttack(draft, 'error', null, ids)?.isBack).toBe(false)
  })
})

describe('withAttackType', () => {
  const draft: AttackDraft = { ...emptyAttackDraft(), attackerId: 'p7' }

  it('種類「バック」を選ぶとバックアタックにする', () => {
    expect(withAttackType(draft, 'back')).toMatchObject({ attackType: 'back', isBack: true })
  })
  it('「バック」を外すとバックアタックも外す', () => {
    const back = withAttackType(draft, 'back')
    expect(withAttackType(back, 'back')).toMatchObject({ attackType: null, isBack: false })
    expect(withAttackType(back, 'left')).toMatchObject({ attackType: 'left', isBack: false })
  })
  it('ほかの種類では、手で選んだバックアタックを残す', () => {
    expect(withAttackType({ ...draft, isBack: true }, 'right')).toMatchObject({ isBack: true })
  })
})

describe('rallyTurnOf（T-36 部活フィードバック）', () => {
  it('自チームのレシーブのあとは自チームが打つ番', () => {
    expect(rallyTurnOf(reception('A', 1))).toBe('us')
  })
  it('自チームのサーブのあとは相手が打ってくる番（アタック欄を先に出さない）', () => {
    expect(rallyTurnOf(serveIn(1))).toBe('opp')
  })
  it('自チームのアタックが継続したあとも相手の番', () => {
    const cont: AttackRecord = {
      kind: 'attack',
      clientId: 'a0',
      setId: 's1',
      attackerId: 'p7',
      attackType: null,
      isBack: false,
      toX: null,
      toY: null,
      result: 'continue',
      prevReception: null,
      recordedAt: t(2),
    }
    expect(rallyTurnOf(cont)).toBe('opp')
    expect(rallyTurnOf(null)).toBe('opp')
  })
  it('相手のスパイクを拾ったあと（A〜D）は自チームが打つ番（F-25）', () => {
    const dug: OppAttackRecord = {
      kind: 'opp_attack',
      clientId: 'd0',
      setId: 's1',
      hitterId: null,
      diggerId: 'p7',
      fromX: null,
      fromY: null,
      toX: null,
      toY: null,
      speed: null,
      result: 'B',
      recordedAt: t(3),
    }
    expect(rallyTurnOf(dug)).toBe('us')
    expect(prevReceptionOf(dug)).toBeNull()
  })
})

describe('withArrowTap（両面のコート図のタップ）', () => {
  const draft = emptyAttackDraft()

  it('自コートは打った位置、相手コートは打った方向（F-20）', () => {
    const a = withArrowTap(draft, 'own', { x: 0.7, y: 0.3 })
    expect(a).toMatchObject({ from: { x: 0.7, y: 0.3 }, to: null })
    const b = withArrowTap(a, 'opponent', { x: 0.2, y: 0.8 })
    expect(b).toMatchObject({ from: { x: 0.7, y: 0.3 }, to: { x: 0.2, y: 0.8 } })
  })
  it('どちらから押してもよく、押し直したら置き換える', () => {
    const a = withArrowTap(draft, 'opponent', { x: 0.2, y: 0.8 })
    const b = withArrowTap(a, 'opponent', { x: 0.5, y: 0.5 })
    expect(b).toMatchObject({ from: null, to: { x: 0.5, y: 0.5 } })
  })
})

describe('withArrowTap（両面のコート図のタップ）', () => {
  const draft = emptyAttackDraft()

  it('自コートは打った位置、相手コートは打った方向（F-20）', () => {
    const a = withArrowTap(draft, 'own', { x: 0.7, y: 0.3 })
    expect(a).toMatchObject({ from: { x: 0.7, y: 0.3 }, to: null })
    const b = withArrowTap(a, 'opponent', { x: 0.2, y: 0.8 })
    expect(b).toMatchObject({ from: { x: 0.7, y: 0.3 }, to: { x: 0.2, y: 0.8 } })
  })
  it('どちらから押してもよく、押し直したら置き換える', () => {
    const a = withArrowTap(draft, 'opponent', { x: 0.2, y: 0.8 })
    const b = withArrowTap(a, 'opponent', { x: 0.5, y: 0.5 })
    expect(b).toMatchObject({ from: null, to: { x: 0.5, y: 0.5 } })
  })
})
