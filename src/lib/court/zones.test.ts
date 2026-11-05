import { describe, expect, it } from 'vitest'
import { ATTACK_LINE_Y, ZONES } from '../../contracts/index.ts'
import { courtSideOf, serveFromZoneOf, zoneBounds, zoneCenter, zoneOf, type CourtSide } from './zones.ts'

// 列の中心（左・中・右）と、前衛・後衛の中心の y
const COLS = [1 / 6, 0.5, 5 / 6] as const
const FRONT_Y = ATTACK_LINE_Y / 2
const BACK_Y = (ATTACK_LINE_Y + 1) / 2
const SIDES: CourtSide[] = ['opponent', 'own']

describe('zoneOf：並び（要件定義書 6 章）', () => {
  it('相手コート：ネット側が左から 2・3・4、奥が 1・6・5', () => {
    expect(COLS.map((x) => zoneOf('opponent', x, FRONT_Y))).toEqual([2, 3, 4])
    expect(COLS.map((x) => zoneOf('opponent', x, BACK_Y))).toEqual([1, 6, 5])
  })

  it('自コート：ネット側が左から 4・3・2、奥が 5・6・1', () => {
    expect(COLS.map((x) => zoneOf('own', x, FRONT_Y))).toEqual([4, 3, 2])
    expect(COLS.map((x) => zoneOf('own', x, BACK_Y))).toEqual([5, 6, 1])
  })

  it.each(SIDES)('%s：ZONES の並びと一致する（ZONES を変えても追従する）', (side) => {
    expect(COLS.map((x) => zoneOf(side, x, FRONT_Y))).toEqual([...ZONES[side].front])
    expect(COLS.map((x) => zoneOf(side, x, BACK_Y))).toEqual([...ZONES[side].back])
  })
})

describe.each(SIDES)('zoneOf：境目と範囲外（%s）', (side) => {
  it('アタックライン上（y = 1/3）は後衛', () => {
    expect(zoneOf(side, 0.5, ATTACK_LINE_Y)).toBe(6)
    expect(zoneOf(side, 0.5, ATTACK_LINE_Y - 0.001)).toBe(3)
  })

  it('列の境目は右側のゾーン', () => {
    expect(zoneOf(side, 1 / 3, FRONT_Y)).toBe(ZONES[side].front[1])
    expect(zoneOf(side, 2 / 3, FRONT_Y)).toBe(ZONES[side].front[2])
    expect(zoneOf(side, 1 / 3, BACK_Y)).toBe(ZONES[side].back[1])
  })

  it('コートの四隅と外周の線上は中に入る', () => {
    expect(zoneOf(side, 0, 0)).toBe(ZONES[side].front[0])
    expect(zoneOf(side, 1, 0)).toBe(ZONES[side].front[2])
    expect(zoneOf(side, 0, 1)).toBe(ZONES[side].back[0])
    expect(zoneOf(side, 1, 1)).toBe(ZONES[side].back[2])
  })

  it('アウト（範囲外）と座標なし（ネット）は null', () => {
    expect(zoneOf(side, 0.5, 1.1)).toBeNull()
    expect(zoneOf(side, -0.1, 0.5)).toBeNull()
    expect(zoneOf(side, 1.1, 0.5)).toBeNull()
    expect(zoneOf(side, 0.5, -0.1)).toBeNull()
    expect(zoneOf(side, null, null)).toBeNull()
    expect(zoneOf(side, 0.5, null)).toBeNull()
    expect(zoneOf(side, null, 0.5)).toBeNull()
  })
})

describe('serveFromZoneOf', () => {
  it('エンドライン上の位置は後衛のゾーン（自コート 5・6・1）', () => {
    expect(COLS.map((x) => serveFromZoneOf(x))).toEqual([5, 6, 1])
  })

  it('列の境目（0、1/3、2/3、1）は右側のゾーン。右端はコートの中', () => {
    expect([0, 1 / 3, 2 / 3, 1].map((x) => serveFromZoneOf(x))).toEqual([5, 6, 1, 1])
  })

  it('範囲外（負の値・1 より大きい）と未入力は null', () => {
    for (const x of [-0.01, 1.2, null]) expect(serveFromZoneOf(x)).toBeNull()
  })
})

describe('zoneBounds・zoneCenter', () => {
  it('範囲の中心は、そのゾーンに戻る', () => {
    for (const side of SIDES) {
      for (const zone of [1, 2, 3, 4, 5, 6]) {
        const c = zoneCenter(side, zone)
        expect(c).not.toBeNull()
        expect(zoneOf(side, c?.x ?? null, c?.y ?? null)).toBe(zone)
      }
    }
  })

  it('相手コートの 2 は左のネット側、5 は右の奥側', () => {
    expect(zoneBounds('opponent', 2)).toEqual({ x0: 0, x1: 1 / 3, y0: 0, y1: ATTACK_LINE_Y })
    expect(zoneBounds('opponent', 5)).toEqual({ x0: 2 / 3, x1: 1, y0: ATTACK_LINE_Y, y1: 1 })
  })

  it('1〜6 以外は null', () => {
    expect(zoneBounds('own', 0)).toBeNull()
    expect(zoneBounds('own', 7)).toBeNull()
    expect(zoneCenter('own', 7)).toBeNull()
  })
})

describe('courtSideOf', () => {
  it('us は自コート、opp は相手コート', () => {
    expect(courtSideOf('us')).toBe('own')
    expect(courtSideOf('opp')).toBe('opponent')
  })
})
