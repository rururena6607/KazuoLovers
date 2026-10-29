import { describe, expect, it } from 'vitest'
import { ATTACK_LINE_Y } from '../../contracts/index.ts'
import { serveFromZoneOf, zoneBounds, zoneCenter, zoneOf } from './zones.ts'

// 列の中心（左・中・右）と、前衛・後衛の中心の y
const COLS = [1 / 6, 0.5, 5 / 6] as const
const FRONT_Y = ATTACK_LINE_Y / 2
const BACK_Y = (ATTACK_LINE_Y + 1) / 2

describe('zoneOf：並び（要件定義書 6 章）', () => {
  it('相手コート：ネット側が左から 2・3・4、奥が 1・6・5', () => {
    expect(COLS.map((x) => zoneOf('opponent', x, FRONT_Y))).toEqual([2, 3, 4])
    expect(COLS.map((x) => zoneOf('opponent', x, BACK_Y))).toEqual([1, 6, 5])
  })

  it('自コート：ネット側が左から 4・3・2、奥が 5・6・1', () => {
    expect(COLS.map((x) => zoneOf('own', x, FRONT_Y))).toEqual([4, 3, 2])
    expect(COLS.map((x) => zoneOf('own', x, BACK_Y))).toEqual([5, 6, 1])
  })
})

describe('zoneOf：境目と範囲外', () => {
  it('アタックライン上（y = 1/3）は後衛', () => {
    expect(zoneOf('opponent', 0.5, ATTACK_LINE_Y)).toBe(6)
    expect(zoneOf('opponent', 0.5, ATTACK_LINE_Y - 0.001)).toBe(3)
  })

  it('列の境目は右側のゾーン', () => {
    expect(zoneOf('opponent', 1 / 3, FRONT_Y)).toBe(3)
    expect(zoneOf('opponent', 2 / 3, FRONT_Y)).toBe(4)
  })

  it('コートの四隅と外周の線上は中に入る', () => {
    expect(zoneOf('opponent', 0, 0)).toBe(2)
    expect(zoneOf('opponent', 1, 0)).toBe(4)
    expect(zoneOf('opponent', 0, 1)).toBe(1)
    expect(zoneOf('opponent', 1, 1)).toBe(5)
  })

  it('アウト（範囲外）と座標なし（ネット）は null', () => {
    expect(zoneOf('opponent', 0.5, 1.1)).toBeNull()
    expect(zoneOf('opponent', -0.1, 0.5)).toBeNull()
    expect(zoneOf('opponent', 1.1, 0.5)).toBeNull()
    expect(zoneOf('opponent', 0.5, -0.1)).toBeNull()
    expect(zoneOf('opponent', null, null)).toBeNull()
    expect(zoneOf('opponent', 0.5, null)).toBeNull()
  })
})

describe('serveFromZoneOf', () => {
  it('エンドライン上の位置は後衛のゾーン（自コート 5・6・1）', () => {
    expect(COLS.map((x) => serveFromZoneOf(x))).toEqual([5, 6, 1])
    expect(serveFromZoneOf(null)).toBeNull()
    expect(serveFromZoneOf(1.2)).toBeNull()
  })
})

describe('zoneBounds・zoneCenter', () => {
  it('範囲の中心は、そのゾーンに戻る', () => {
    for (const side of ['opponent', 'own'] as const) {
      for (const zone of [1, 2, 3, 4, 5, 6]) {
        const c = zoneCenter(side, zone)
        expect(c).not.toBeNull()
        expect(zoneOf(side, c?.x ?? null, c?.y ?? null)).toBe(zone)
      }
    }
  })

  it('相手コートの 2 は左のネット側', () => {
    expect(zoneBounds('opponent', 2)).toEqual({ x0: 0, x1: 1 / 3, y0: 0, y1: ATTACK_LINE_Y })
  })

  it('1〜6 以外は null', () => {
    expect(zoneBounds('own', 0)).toBeNull()
    expect(zoneBounds('own', 7)).toBeNull()
    expect(zoneCenter('own', 7)).toBeNull()
  })
})
