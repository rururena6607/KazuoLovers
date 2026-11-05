import { describe, expect, it } from 'vitest'
import { ATTACK_LINE_Y } from '../../contracts/index.ts'
import { COURT_H, COURT_W, MARGIN, NET_Y, attackLinesY, fromSvg, toSvg } from './boardGeometry.ts'

describe('toSvg・fromSvg', () => {
  it('コートの四隅と中心を、余白を含めた位置に写す', () => {
    expect(toSvg({ x: 0, y: 0 })).toEqual({ x: MARGIN, y: MARGIN })
    expect(toSvg({ x: 1, y: 1 })).toEqual({ x: MARGIN + COURT_W, y: MARGIN + COURT_H })
    expect(toSvg({ x: 0.5, y: 0.5 })).toEqual({ x: MARGIN + COURT_W / 2, y: MARGIN + COURT_H / 2 })
  })

  it('往復すると元の点に戻る', () => {
    const p = { x: 0.3, y: 0.8 }
    const back = fromSvg(toSvg(p))
    expect(back.x).toBeCloseTo(p.x, 10)
    expect(back.y).toBeCloseTo(p.y, 10)
  })

  it('コートの外（余白・SVG の外）は端に寄せる', () => {
    expect(fromSvg({ x: -50, y: 9999 })).toEqual({ x: 0, y: 1 })
  })
})

describe('attackLinesY', () => {
  it('ネットの両側に、同じ距離で 1 本ずつ引く（9m の奥行きのうち 3m）', () => {
    const [opp, own] = attackLinesY()
    expect(NET_Y - opp).toBeCloseTo(own - NET_Y, 10)
    // コート全体は 18m。ネットから 3m は全体の 3/18
    expect(own - NET_Y).toBeCloseTo(3 / 18, 10)
    expect(own - NET_Y).toBeCloseTo(0.5 * ATTACK_LINE_Y, 10)
  })
})
