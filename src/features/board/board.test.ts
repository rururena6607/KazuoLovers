import { describe, expect, it } from 'vitest'
import {
  BOARD_H,
  BOARD_W,
  EMPTY_BOARD,
  EMPTY_LINEUP,
  OPP_SPOTS,
  OUR_SPOTS,
  addOpp,
  clearShapes,
  clampPoint,
  halfBounds,
  ellipseOf,
  isBigEnough,
  pieceAt,
  resetMoved,
  removeOpp,
  renumberOpp,
  rotate,
  rotateBoard,
  togglePlayer,
  type BoardState,
} from './board.ts'

const L = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] // ポジション1〜6

describe('rotate（サイドアウトで時計回り）', () => {
  it('ポジション2の選手が1へ、1の選手が6へ動く', () => {
    const r = rotate(L)
    expect(r[0]).toBe('p2') // 新しいポジション1
    expect(r[5]).toBe('p1') // 新しいポジション6
    expect(r).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p1'])
  })
  it('6回まわすと元に戻り、戻すと1つ前に戻る', () => {
    let r: readonly (string | null)[] = L
    for (let i = 0; i < 6; i++) r = rotate(r)
    expect(r).toEqual(L)
    expect(rotate(rotate(L), true)).toEqual(L)
  })
  it('空きがあっても位置ごとまわる', () => {
    expect(rotate(['a', null, null, null, null, null])).toEqual([null, null, null, null, null, 'a'])
  })
})

describe('togglePlayer（スタメンを選ぶ）', () => {
  it('最初の空きに入れ、もう一度押すと外す', () => {
    const a = togglePlayer(EMPTY_LINEUP, 'x')
    expect(a[0]).toBe('x')
    const b = togglePlayer(a, 'y')
    expect(b.slice(0, 2)).toEqual(['x', 'y'])
    expect(togglePlayer(b, 'x')).toEqual([null, 'y', null, null, null, null])
  })
  it('6人いっぱいなら足さない', () => {
    expect(togglePlayer(L, 'p7')).toEqual(L)
  })
})

describe('立ち位置', () => {
  it('自チームは下のコート、前衛はネット寄り。相手は上下・左右を返した位置', () => {
    const net = BOARD_H / 2
    for (const p of OUR_SPOTS) expect(p.y).toBeGreaterThan(net)
    expect(OUR_SPOTS[3]!.y).toBeLessThan(OUR_SPOTS[4]!.y) // 4（前衛）は 5（後衛）よりネット寄り
    expect(OUR_SPOTS[3]!.x).toBeLessThan(OUR_SPOTS[1]!.x) // 4 はレフト、2 はライト
    OPP_SPOTS.forEach((p, i) => {
      expect(p.y).toBeLessThan(net)
      expect(p.x).toBe(BOARD_W - OUR_SPOTS[i]!.x)
    })
  })
  it('pieceAt：動かした駒はその位置、ほかは基本の立ち位置', () => {
    const s: BoardState = { ...EMPTY_BOARD, lineup: L, moved: { p3: { x: 1, y: 2 } } }
    expect(pieceAt(s, 'p1')).toEqual(OUR_SPOTS[0])
    expect(pieceAt(s, 'p3')).toEqual({ x: 1, y: 2 })
    expect(pieceAt(s, 'nobody')).toBeNull()
  })
  it('ローテーションしたら動かした位置は消える', () => {
    const s: BoardState = { ...EMPTY_BOARD, lineup: L, moved: { p3: { x: 1, y: 2 } } }
    const r = rotateBoard(s)
    expect(r.moved).toEqual({})
    expect(pieceAt(r, 'p3')).toEqual(OUR_SPOTS[1]) // p3 はポジション2へ
  })
})

describe('図形', () => {
  it('短すぎる矢印は作らない', () => {
    expect(isBigEnough({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false)
    expect(isBigEnough({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true)
  })
  it('エリアのだ円は2点を対角とする長方形に収まり、どちらから引いても同じ', () => {
    expect(ellipseOf({ x: 10, y: 20 }, { x: 4, y: 6 })).toEqual({ cx: 7, cy: 13, rx: 3, ry: 7 })
    expect(ellipseOf({ x: 4, y: 6 }, { x: 10, y: 20 })).toEqual({ cx: 7, cy: 13, rx: 3, ry: 7 })
  })
  it('出している半面の外には出さない', () => {
    expect(clampPoint({ x: -5, y: 999 }, 'ours')).toEqual({ x: 0, y: BOARD_H })
    expect(clampPoint({ x: 50, y: 10 }, 'ours').y).toBe(halfBounds('ours').y)
    expect(clampPoint({ x: 150, y: 999 }, 'opp')).toEqual({ x: BOARD_W, y: halfBounds('opp').height })
  })
})

describe('相手の駒（背番号）', () => {
  it('足した順に相手のポジション1〜6の立ち位置に置き、7つ目からはくり返す', () => {
    let s = EMPTY_BOARD
    ;[12, 3, 7, 1, 9, 10, 4].forEach((n, i) => (s = addOpp(s, n, `o${i}`)))
    expect(s.opp.map((o) => o.number)).toEqual([12, 3, 7, 1, 9, 10, 4])
    expect(pieceAt(s, 'o0')).toEqual(OPP_SPOTS[0])
    expect(pieceAt(s, 'o5')).toEqual(OPP_SPOTS[5])
    expect(pieceAt(s, 'o6')).toEqual(OPP_SPOTS[0])
  })
  it('同じ背番号は足さない・同じ番号には変えない', () => {
    let s = addOpp(addOpp(EMPTY_BOARD, 5, 'a'), 8, 'b')
    expect(addOpp(s, 5, 'c').opp).toHaveLength(2)
    expect(renumberOpp(s, 'b', 5)).toBe(s)
    s = renumberOpp(s, 'b', 11)
    expect(s.opp.map((o) => o.number)).toEqual([5, 11])
  })
  it('外すと動かした位置も消える', () => {
    const s: BoardState = { ...addOpp(EMPTY_BOARD, 5, 'a'), moved: { a: { x: 1, y: 1 } } }
    const r = removeOpp(s, 'a')
    expect(r.opp).toEqual([])
    expect(r.moved).toEqual({})
  })
})

describe('半面', () => {
  it('どちらの半面もネットを含み、自チームは下・相手は上', () => {
    const ours = halfBounds('ours')
    const opp = halfBounds('opp')
    expect(ours.y + ours.height).toBe(BOARD_H)
    expect(opp.y).toBe(0)
    for (const b of [ours, opp]) {
      expect(b.y).toBeLessThan(BOARD_H / 2)
      expect(b.y + b.height).toBeGreaterThan(BOARD_H / 2)
    }
  })
  it('自チームの立ち位置は自チームの半面に、相手の立ち位置は相手の半面に入る', () => {
    const inside = (p: { y: number }, b: { y: number; height: number }) => p.y >= b.y && p.y <= b.y + b.height
    OUR_SPOTS.forEach((p) => expect(inside(p, halfBounds('ours'))).toBe(true))
    OPP_SPOTS.forEach((p) => expect(inside(p, halfBounds('opp'))).toBe(true))
  })
})

describe('半面ごとの消去・戻し', () => {
  const arrowOurs = { id: 'a', kind: 'arrow' as const, from: { x: 10, y: 150 }, to: { x: 40, y: 120 } }
  const areaOpp = { id: 'b', kind: 'area' as const, tone: 'attack' as const, from: { x: 10, y: 20 }, to: { x: 40, y: 60 } }
  it('図を消すのは出している半面だけ', () => {
    const s: BoardState = { ...EMPTY_BOARD, shapes: [arrowOurs, areaOpp] }
    expect(clearShapes(s, 'ours').shapes).toEqual([areaOpp])
    expect(clearShapes(s, 'opp').shapes).toEqual([arrowOurs])
  })
  it('駒を戻すのは出している半面だけ', () => {
    const base = addOpp({ ...EMPTY_BOARD, lineup: L }, 7, 'o7')
    const s: BoardState = { ...base, moved: { p1: { x: 1, y: 100 }, o7: { x: 2, y: 3 } } }
    expect(resetMoved(s, 'ours').moved).toEqual({ o7: { x: 2, y: 3 } })
    expect(resetMoved(s, 'opp').moved).toEqual({ p1: { x: 1, y: 100 } })
  })
})
