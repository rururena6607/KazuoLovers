import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SET_POINTS,
  FINAL_SET_POINTS,
  type AttackRecord,
  type AttackResult,
  type Grade,
  type RallyState,
  type ReceptionRecord,
  type ReceptionResult,
  type ServeRecord,
  type ServeResult,
} from '../../contracts/index.ts'
import {
  applyPoint,
  applyPointInSet,
  isSetOver,
  pointFor,
  setWinner,
  toggleServing,
} from './rally.ts'

const serve = (result: ServeResult, reception: Grade | null = null): ServeRecord => ({
  kind: 'serve',
  clientId: 'c',
  setId: 's1',
  serverId: 'p1',
  serveType: 'float',
  fromX: null,
  toX: null,
  toY: null,
  result,
  missType: result === 'miss' ? 'net' : null,
  reception,
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-10-29T00:00:00Z',
})

const reception = (result: ReceptionResult): ReceptionRecord => ({
  kind: 'reception',
  clientId: 'c',
  setId: 's1',
  receiverId: null,
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result,
  recordedAt: '2026-10-29T00:00:00Z',
})

const attack = (result: AttackResult): AttackRecord => ({
  kind: 'attack',
  clientId: 'c',
  setId: 's1',
  attackerId: 'p1',
  attackType: null,
  isBack: false,
  toX: null,
  toY: null,
  result,
  prevReception: null,
  recordedAt: '2026-10-29T00:00:00Z',
})

const state = (ourScore: number, oppScore: number, serving: RallyState['serving']): RallyState => ({
  ourScore,
  oppScore,
  serving,
})

describe('pointFor：結果だけで得点が決まる場合', () => {
  it('自チームのエース → 自チームに入る', () => {
    expect(pointFor(serve('ace'))).toEqual({ side: 'us', cause: 'ace' })
  })
  it('相手ミス → 自チームに入る', () => {
    expect(pointFor(reception('opp_miss'))).toEqual({ side: 'us', cause: 'opp_miss' })
  })
  it('自チームのサーブミス → 相手に入る', () => {
    expect(pointFor(serve('miss'))).toEqual({ side: 'opp', cause: 'serve_miss' })
  })
  it('被エース → 相手に入る', () => {
    expect(pointFor(reception('ace'))).toEqual({ side: 'opp', cause: 'aced' })
  })
  it('アタックの決定 → 自チームに入る', () => {
    expect(pointFor(attack('kill'))).toEqual({ side: 'us', cause: 'kill' })
  })
  it('アタックのミス → 相手に入る', () => {
    expect(pointFor(attack('error'))).toEqual({ side: 'opp', cause: 'attack_error' })
  })
  it('被ブロック → 相手に入る', () => {
    expect(pointFor(attack('blocked'))).toEqual({ side: 'opp', cause: 'blocked' })
  })
})

describe('pointFor：ラリーが続く場合は null', () => {
  it.each(['A', 'B', 'C', 'D'] as const)('サーブのイン（相手のレシーブ %s）', (g) => {
    expect(pointFor(serve('in', g))).toBeNull()
  })
  it.each(['A', 'B', 'C', 'D'] as const)('自チームのレシーブ %s', (g) => {
    expect(pointFor(reception(g))).toBeNull()
  })
  it('アタックの継続', () => {
    expect(pointFor(attack('continue'))).toBeNull()
  })
})

describe('applyPoint', () => {
  it('自チームの得点：+1 してサーブ権は自チーム', () => {
    expect(applyPoint(state(3, 5, 'opp'), 'us')).toEqual(state(4, 5, 'us'))
  })
  it('相手の得点：+1 してサーブ権は相手', () => {
    expect(applyPoint(state(3, 5, 'us'), 'opp')).toEqual(state(3, 6, 'opp'))
  })
  it('もとの状態を書き換えない', () => {
    const s = state(0, 0, 'us')
    applyPoint(s, 'opp')
    expect(s).toEqual(state(0, 0, 'us'))
  })
})

describe('サーブ権の切替', () => {
  it('サーブ権を切り替える。もとの状態は書き換えない', () => {
    const s = state(1, 1, 'us')
    expect(toggleServing(s)).toEqual(state(1, 1, 'opp'))
    expect(toggleServing(state(1, 1, 'opp')).serving).toBe('us')
    expect(s).toEqual(state(1, 1, 'us'))
  })
})

describe('練習モードのサーブには得点がない', () => {
  it.each(['ace', 'miss', 'in'] as const)('狙ったゾーンがあるサーブ（%s）は null', (result) => {
    expect(pointFor({ ...serve(result), targetZone: 5 })).toBeNull()
  })
})

describe('applyPointInSet', () => {
  it('セット中は得点を足す', () => {
    expect(applyPointInSet(state(24, 23, 'opp'), 'us', DEFAULT_SET_POINTS)).toEqual(state(25, 23, 'us'))
  })
  it('セットが終わっていれば、状態を変えずに返す（25-23 のあとに 26-23 を作らない）', () => {
    const over = state(25, 23, 'us')
    expect(applyPointInSet(over, 'us', DEFAULT_SET_POINTS)).toBe(over)
    expect(applyPointInSet(over, 'opp', DEFAULT_SET_POINTS)).toBe(over)
  })
})

describe('セットの点数の検証', () => {
  it.each([0, -1, 25.5, Number.NaN, Number.POSITIVE_INFINITY])('%s は例外', (points) => {
    expect(() => isSetOver(state(0, 0, 'us'), points)).toThrow(RangeError)
    expect(() => setWinner(state(2, 0, 'us'), points)).toThrow(RangeError)
  })
})

describe('isSetOver・setWinner', () => {
  it('25点に達して2点差 → 終了', () => {
    expect(isSetOver(state(25, 23, 'us'), DEFAULT_SET_POINTS)).toBe(true)
    expect(setWinner(state(25, 23, 'us'), DEFAULT_SET_POINTS)).toBe('us')
    expect(setWinner(state(20, 25, 'opp'), DEFAULT_SET_POINTS)).toBe('opp')
  })
  it('25点でも1点差なら続く（25-24）', () => {
    expect(isSetOver(state(25, 24, 'us'), DEFAULT_SET_POINTS)).toBe(false)
  })
  it('24-24 から 26-24 で終了', () => {
    expect(isSetOver(state(25, 25, 'us'), DEFAULT_SET_POINTS)).toBe(false)
    expect(isSetOver(state(26, 25, 'us'), DEFAULT_SET_POINTS)).toBe(false)
    expect(isSetOver(state(26, 24, 'us'), DEFAULT_SET_POINTS)).toBe(true)
  })
  it('デュースが長引いても2点差で終了（30-28 は自チーム、28-30 は相手）', () => {
    expect(setWinner(state(30, 28, 'us'), DEFAULT_SET_POINTS)).toBe('us')
    expect(setWinner(state(28, 30, 'opp'), DEFAULT_SET_POINTS)).toBe('opp')
  })
  it('点数に達する前は、点差があっても続く（24-0）', () => {
    expect(isSetOver(state(24, 0, 'us'), DEFAULT_SET_POINTS)).toBe(false)
  })
  it('最終セットは15点（15-13 で終了、15-14 は続く）', () => {
    expect(isSetOver(state(15, 13, 'us'), FINAL_SET_POINTS)).toBe(true)
    expect(isSetOver(state(15, 14, 'us'), FINAL_SET_POINTS)).toBe(false)
  })
  it('0-0 は終わっていない', () => {
    expect(setWinner(state(0, 0, 'us'), DEFAULT_SET_POINTS)).toBeNull()
  })
})
