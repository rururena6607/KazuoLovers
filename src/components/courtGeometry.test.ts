import { describe, expect, it } from 'vitest'
import {
  COURT_H,
  MARGIN_X,
  MARGIN_Y,
  FULL_NET_Y,
  allZones,
  courtToFull,
  fullToCourt,
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

describe('fullToCourt / courtToFull（両面のコート図）', () => {
  it('ネットの線より上は相手コート、下は自コート。どちらもネットが y=0', () => {
    const above = fullToCourt({ x: MARGIN_X, y: FULL_NET_Y - 1 })
    expect(above.side).toBe('opponent')
    expect(above.p.y).toBeGreaterThan(0)
    const at = fullToCourt({ x: MARGIN_X, y: FULL_NET_Y })
    expect(at).toEqual({ side: 'own', p: { x: 0, y: 0 } })
  })

  it('上の端は相手コートの奥（y=1）、下の端は自コートの奥（y=1）', () => {
    expect(fullToCourt({ x: MARGIN_X, y: MARGIN_Y }).p).toEqual({ x: 0, y: 1 })
    const bottom = fullToCourt({ x: MARGIN_X, y: MARGIN_Y + 2 * COURT_H })
    expect(bottom).toEqual({ side: 'own', p: { x: 0, y: 1 } })
  })

  it('courtToFull の逆になっている', () => {
    for (const side of ['opponent', 'own'] as const) {
      const p = { x: 0.25, y: 0.7 }
      const back = fullToCourt(courtToFull(side, p))
      expect(back.side).toBe(side)
      expect(back.p.x).toBeCloseTo(p.x)
      expect(back.p.y).toBeCloseTo(p.y)
    }
  })
})
