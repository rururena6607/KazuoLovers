import { describe, expect, it } from 'vitest'
import type { PointRecord, ServeRecord, Side } from '../../contracts/index.ts'
import { autoPoint, inRally, lastPointOf, scoreOf, servingOf, setPointsOf } from './score.ts'

let n = 0
const point = (side: Side): PointRecord => {
  n += 1
  return {
    kind: 'point',
    clientId: `pt${n}`,
    setId: 's1',
    side,
    cause: 'manual',
    sourceId: null,
    ourScore: 0,
    oppScore: 0,
    recordedAt: `2026-10-29T10:00:${String(n).padStart(2, '0')}.000Z`,
  }
}

const serve = (result: ServeRecord['result']): ServeRecord => ({
  kind: 'serve',
  clientId: 'sv1',
  setId: 's1',
  serverId: 'p7',
  serveType: 'jump',
  fromX: null,
  toX: null,
  toY: null,
  result,
  missType: result === 'miss' ? 'net' : null,
  reception: result === 'in' ? 'B' : null,
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-10-29T10:00:00.000Z',
})

const ids = { clientId: 'new', recordedAt: '2026-10-29T10:01:00.000Z' }

describe('scoreOf', () => {
  it('得点がなければ 0-0', () => {
    expect(scoreOf([])).toEqual({ ourScore: 0, oppScore: 0 })
  })
  it('側ごとに数える', () => {
    expect(scoreOf([point('us'), point('opp'), point('us')])).toEqual({ ourScore: 2, oppScore: 1 })
  })
})

describe('servingOf', () => {
  it('最初は自チーム、そのあとは最後に得点した側', () => {
    expect(servingOf([], null)).toBe('us')
    expect(servingOf([point('us'), point('opp')], null)).toBe('opp')
  })
  it('手動の切替は、次に得点が入るまで有効', () => {
    const pts = [point('us')]
    expect(servingOf(pts, { serving: 'opp', atPoints: 1 })).toBe('opp')
    expect(servingOf([...pts, point('us')], { serving: 'opp', atPoints: 1 })).toBe('us')
  })
})

describe('autoPoint', () => {
  const state = { ourScore: 3, oppScore: 4, serving: 'us' as const }

  it('エースは自チームに+1し、そのあとの得点を残す', () => {
    expect(autoPoint(serve('ace'), state, [], ids)).toMatchObject({
      side: 'us',
      cause: 'ace',
      sourceId: 'sv1',
      ourScore: 4,
      oppScore: 4,
    })
  })
  it('サーブミスは相手に+1', () => {
    expect(autoPoint(serve('miss'), state, [], ids)).toMatchObject({ side: 'opp', oppScore: 5 })
  })
  it('A〜D はラリーが続くので得点なし', () => {
    expect(autoPoint(serve('in'), state, [], ids)).toBeNull()
  })
  it('同じ1本の得点がもうあれば足さない', () => {
    const existing = { ...point('us'), sourceId: 'sv1' }
    expect(autoPoint(serve('ace'), state, [existing], ids)).toBeNull()
  })
})

describe('inRally', () => {
  it('A〜D のあと、得点が入るまではラリー中', () => {
    const rec = serve('in')
    expect(inRally([rec], [])).toBe(true)
    expect(inRally([rec], [{ ...point('us'), recordedAt: '2026-10-29T10:00:30.000Z' }])).toBe(false)
  })
  it('エース・ミスはラリーにならない', () => {
    expect(inRally([serve('ace')], [])).toBe(false)
    expect(inRally([], [])).toBe(false)
  })
})

describe('lastPointOf / setPointsOf', () => {
  it('その側の最後の得点', () => {
    const a = point('us')
    const b = point('opp')
    expect(lastPointOf([a, b], 'us')).toBe(a)
    expect(lastPointOf([b], 'us')).toBeNull()
  })
  it('5セット目だけ 15 点', () => {
    expect(setPointsOf(1, 25)).toBe(25)
    expect(setPointsOf(5, 25)).toBe(15)
  })
})
