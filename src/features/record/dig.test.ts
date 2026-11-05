import { describe, expect, it } from 'vitest'
import { DIG_RESULTS, buildDig, digGradeOf, emptyDigDraft, withDigArrowTap } from './dig.ts'

const ids = { clientId: 'd1', setId: 's1', recordedAt: '2026-11-05T10:00:00.000Z' }

describe('buildDig（F-25）', () => {
  it('結果だけで作れる（ほかは任意で null）', () => {
    expect(buildDig(emptyDigDraft(), 'killed', ids)).toEqual({
      kind: 'opp_attack',
      clientId: 'd1',
      setId: 's1',
      hitterId: null,
      diggerId: null,
      fromX: null,
      fromY: null,
      toX: null,
      toY: null,
      speed: null,
      result: 'killed',
      recordedAt: ids.recordedAt,
    })
  })
  it('打った相手・拾った選手・矢印・速さを残す', () => {
    const draft = {
      hitterId: 'o4',
      diggerId: 'p7',
      from: { x: 0.1, y: 0.2 },
      to: { x: 0.6, y: 0.7 },
      speed: 'fast' as const,
    }
    expect(buildDig(draft, 'B', ids)).toMatchObject({
      hitterId: 'o4',
      diggerId: 'p7',
      fromX: 0.1,
      fromY: 0.2,
      toX: 0.6,
      toY: 0.7,
      speed: 'fast',
      result: 'B',
    })
  })
})

describe('withDigArrowTap', () => {
  it('相手コートは打った位置、自コートは落ちた位置・拾った位置', () => {
    const a = withDigArrowTap(emptyDigDraft(), 'opponent', { x: 0.3, y: 0.4 })
    const b = withDigArrowTap(a, 'own', { x: 0.8, y: 0.9 })
    expect(b).toMatchObject({ from: { x: 0.3, y: 0.4 }, to: { x: 0.8, y: 0.9 } })
  })
})

describe('DIG_RESULTS / digGradeOf', () => {
  it('ボタンは 拾えず／A／B／C／D／相手ミス の順（F-25）', () => {
    expect(DIG_RESULTS.map((r) => r.label)).toEqual(['拾えず', 'A', 'B', 'C', 'D', '相手ミス'])
  })
  it('A〜D だけが拾えた評価', () => {
    expect(digGradeOf('C')).toBe('C')
    expect(digGradeOf('killed')).toBeNull()
    expect(digGradeOf('opp_error')).toBeNull()
  })
})
