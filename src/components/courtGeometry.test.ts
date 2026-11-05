import { describe, expect, it } from 'vitest'
import {
  COURT_H,
  MARGIN_X,
  MARGIN_Y,
  allZones,
  courtToSvg,
  svgToCourt,
  zoneColor,
  zoneLabel,
} from './courtGeometry.ts'

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

describe('zoneLabel / allZones', () => {
  it('ゾーン番号を丸数字にする', () => {
    expect(zoneLabel(1)).toBe('①')
    expect(zoneLabel(6)).toBe('⑥')
  })

  it('ZONES からゾーン番号を小さい順に並べる', () => {
    expect(allZones('opponent')).toEqual([1, 2, 3, 4, 5, 6])
    expect(allZones('own')).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('zoneColor', () => {
  it('ゾーン1〜6はそれぞれ別の色', () => {
    const colors = [1, 2, 3, 4, 5, 6].map(zoneColor)
    expect(new Set(colors).size).toBe(6)
    expect(zoneColor(5)).toBe('var(--zone-5)')
  })
  it('1〜6 以外は文字の色', () => {
    expect(zoneColor(0)).toBe('var(--ink)')
    expect(zoneColor(7)).toBe('var(--ink)')
  })
})
