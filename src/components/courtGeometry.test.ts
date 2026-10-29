import { describe, expect, it } from 'vitest'
import { COURT_H, MARGIN_X, MARGIN_Y, courtToSvg, svgToCourt } from './courtGeometry.ts'

describe('svgToCourt', () => {
  it('相手コート：左上の角は奥の左（x=0, y=1）、左下の角はネットの左（x=0, y=0）', () => {
    expect(svgToCourt('opponent', { x: MARGIN_X, y: MARGIN_Y })).toEqual({ x: 0, y: 1 })
    expect(svgToCourt('opponent', { x: MARGIN_X, y: MARGIN_Y + COURT_H })).toEqual({ x: 0, y: 0 })
  })

  it('自コート：上の端がネット（y=0）', () => {
    expect(svgToCourt('own', { x: MARGIN_X, y: MARGIN_Y })).toEqual({ x: 0, y: 0 })
  })

  it('コートの外は範囲外の値になる', () => {
    const p = svgToCourt('opponent', { x: 0, y: 0 })
    expect(p.x).toBeLessThan(0)
    expect(p.y).toBeGreaterThan(1)
  })

  it('courtToSvg の逆になっている', () => {
    for (const side of ['opponent', 'own'] as const) {
      const p = { x: 0.25, y: 0.7 }
      const back = svgToCourt(side, courtToSvg(side, p))
      expect(back.x).toBeCloseTo(p.x)
      expect(back.y).toBeCloseTo(p.y)
    }
  })
})
