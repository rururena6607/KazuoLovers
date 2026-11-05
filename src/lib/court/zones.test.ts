import { describe, expect, it } from 'vitest'
import { ATTACK_LINE_Y, ZONES } from '../../contracts/index.ts'
import {
  courtSideOf,
  serveFromZoneOf,
  zoneBounds,
  zoneCenter,
  zoneOf,
  type ColSplits,
  type CourtSide,
} from './zones.ts'

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

// 列の境目（F-24）：相手コートの縦の点線2本。例：左の列を狭く（0.25）、右の列を広く（0.5 から）する
describe('列の境目（colSplits）', () => {
  const SPLITS: ColSplits = [0.25, 0.5]

  it('相手コート：境目に合わせて、左・中・右の列に分ける（ネット側 2・3・4、奥 1・6・5）', () => {
    // 左の列 0〜0.25、中の列 0.25〜0.5、右の列 0.5〜1
    expect([0.1, 0.3, 0.6].map((x) => zoneOf('opponent', x, FRONT_Y, SPLITS))).toEqual([2, 3, 4])
    expect([0.1, 0.3, 0.6].map((x) => zoneOf('opponent', x, BACK_Y, SPLITS))).toEqual([1, 6, 5])
    // 等分（0〜1/3、1/3〜2/3、2/3〜1）と比べる：境目を動かすと、同じ x でも列が変わる
    expect(zoneOf('opponent', 0.3, FRONT_Y)).toBe(2) // 等分では左（0.3 < 1/3）
    expect(zoneOf('opponent', 0.3, FRONT_Y, SPLITS)).toBe(3) // 境目を動かすと中（0.25 ≤ 0.3 < 0.5）
    expect(zoneOf('opponent', 0.55, FRONT_Y)).toBe(3) // 等分では中（1/3 ≤ 0.55 < 2/3）
    expect(zoneOf('opponent', 0.55, FRONT_Y, SPLITS)).toBe(4) // 境目を動かすと右（0.5 ≤ 0.55）
    // 動かない値：0.2 は、どちらでも左。0.4 は、どちらでも中
    expect([0.2, 0.4].map((x) => zoneOf('opponent', x, FRONT_Y))).toEqual([2, 3])
    expect([0.2, 0.4].map((x) => zoneOf('opponent', x, FRONT_Y, SPLITS))).toEqual([2, 3])
  })

  it('境目の線上は右の列。右端はコートの中', () => {
    expect(zoneOf('opponent', 0.25, FRONT_Y, SPLITS)).toBe(3)
    expect(zoneOf('opponent', 0.5, FRONT_Y, SPLITS)).toBe(4)
    expect(zoneOf('opponent', 1, FRONT_Y, SPLITS)).toBe(4)
    expect(zoneOf('opponent', 0, FRONT_Y, SPLITS)).toBe(2)
  })

  it('範囲外は、境目があっても null', () => {
    expect(zoneOf('opponent', 1.1, FRONT_Y, SPLITS)).toBeNull()
    expect(zoneOf('opponent', 0.5, 1.1, SPLITS)).toBeNull()
  })

  it('自コートでは使わない（自コートは3等分のまま）', () => {
    for (const x of [0.1, 0.3, 0.55, 0.9]) {
      expect(zoneOf('own', x, FRONT_Y, SPLITS)).toBe(zoneOf('own', x, FRONT_Y))
      expect(zoneOf('own', x, BACK_Y, SPLITS)).toBe(zoneOf('own', x, BACK_Y))
    }
    expect(zoneBounds('own', 4, SPLITS)).toEqual(zoneBounds('own', 4))
  })

  it('使えない境目は等分として扱う（逆順・同じ値・範囲外・NaN）', () => {
    const bad: ColSplits[] = [
      [0.6, 0.4],
      [0.5, 0.5],
      [-0.1, 0.5],
      [0.3, 1.2],
      [Number.NaN, 0.5],
    ]
    for (const splits of bad) {
      for (const x of [0.1, 0.3, 0.55, 0.9]) {
        expect(zoneOf('opponent', x, FRONT_Y, splits)).toBe(zoneOf('opponent', x, FRONT_Y))
      }
      expect(zoneBounds('opponent', 3, splits)).toEqual(zoneBounds('opponent', 3))
    }
  })

  it('既定の3等分（1/3、2/3）を渡しても、渡さないときと同じ', () => {
    const equal: ColSplits = [1 / 3, 2 / 3]
    for (const side of SIDES) {
      for (const x of [0, 0.1, 1 / 3, 0.5, 2 / 3, 0.9, 1]) {
        expect(zoneOf(side, x, FRONT_Y, equal)).toBe(zoneOf(side, x, FRONT_Y))
        expect(zoneOf(side, x, BACK_Y, equal)).toBe(zoneOf(side, x, BACK_Y))
      }
    }
  })

  it('zoneBounds：境目の位置が範囲になる（相手コートの 2・3・4 が 0〜0.25、0.25〜0.5、0.5〜1）', () => {
    expect(zoneBounds('opponent', 2, SPLITS)).toEqual({ x0: 0, x1: 0.25, y0: 0, y1: ATTACK_LINE_Y })
    expect(zoneBounds('opponent', 3, SPLITS)).toEqual({ x0: 0.25, x1: 0.5, y0: 0, y1: ATTACK_LINE_Y })
    expect(zoneBounds('opponent', 4, SPLITS)).toEqual({ x0: 0.5, x1: 1, y0: 0, y1: ATTACK_LINE_Y })
    // 奥の列も同じ境目：1 が左、6 が中、5 が右
    expect(zoneBounds('opponent', 1, SPLITS)).toEqual({ x0: 0, x1: 0.25, y0: ATTACK_LINE_Y, y1: 1 })
    expect(zoneBounds('opponent', 5, SPLITS)).toEqual({ x0: 0.5, x1: 1, y0: ATTACK_LINE_Y, y1: 1 })
    expect(zoneBounds('opponent', 7, SPLITS)).toBeNull()
  })

  it('zoneCenter：範囲の中心。そのゾーンに戻る', () => {
    expect(zoneCenter('opponent', 3, SPLITS)).toEqual({ x: 0.375, y: ATTACK_LINE_Y / 2 })
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      const c = zoneCenter('opponent', zone, SPLITS)
      expect(zoneOf('opponent', c?.x ?? null, c?.y ?? null, SPLITS)).toBe(zone)
    }
  })
})
