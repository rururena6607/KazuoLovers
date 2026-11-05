import { describe, expect, it } from 'vitest'
import {
  MAX_NAME_LENGTH,
  MIN_AREA_SIZE,
  MIN_ARROW_LENGTH,
  addArea,
  addArrow,
  addPiece,
  clearDrawings,
  clamp01,
  emptyBoard,
  movePiece,
  parsePieceNumber,
  removeItem,
} from './boardModel.ts'

describe('parsePieceNumber', () => {
  it('半角・全角の数字を受け付け、前後の空白は無視する', () => {
    expect(parsePieceNumber('7')).toBe(7)
    expect(parsePieceNumber(' 12 ')).toBe(12)
    expect(parsePieceNumber('１０')).toBe(10)
    expect(parsePieceNumber('0')).toBe(0)
  })

  it('数字でないもの・3 桁・空は null', () => {
    expect(parsePieceNumber('')).toBeNull()
    expect(parsePieceNumber('abc')).toBeNull()
    expect(parsePieceNumber('100')).toBeNull()
    expect(parsePieceNumber('-1')).toBeNull()
    expect(parsePieceNumber('1.5')).toBeNull()
  })
})

describe('addPiece', () => {
  it('駒を足し、id を振る。名前は前後の空白を取り、長さの上限で切る', () => {
    const b = addPiece(emptyBoard, 7, '  渡辺くんです  ')
    expect(b.pieces).toHaveLength(1)
    expect(b.pieces[0]).toMatchObject({ id: 'b1', number: 7, name: '渡辺くん'.slice(0, MAX_NAME_LENGTH) })
    expect(b.nextId).toBe(2)
    expect(emptyBoard.pieces).toHaveLength(0)
  })

  it('足した駒は重ならない位置に並び、コートの中に収まる', () => {
    let b = emptyBoard
    for (let i = 1; i <= 14; i++) b = addPiece(b, i, '')
    const spots = new Set(b.pieces.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`))
    expect(spots.size).toBe(14)
    for (const p of b.pieces) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(1)
    }
  })
})

describe('movePiece', () => {
  it('指定した駒だけを動かし、コートの外には出さない', () => {
    const before = addPiece(addPiece(emptyBoard, 1, ''), 2, '')
    let b = movePiece(before, 'b1', { x: 0.4, y: 0.75 })
    expect(b.pieces[0]).toMatchObject({ x: 0.4, y: 0.75 })
    expect(b.pieces[1]).toEqual(before.pieces[1])
    b = movePiece(b, 'b2', { x: 1.4, y: -0.3 })
    expect(b.pieces[1]).toMatchObject({ x: 1, y: 0 })
  })
})

describe('addArrow', () => {
  it('矢印を足す', () => {
    const b = addArrow(emptyBoard, { x: 0.1, y: 0.1 }, { x: 0.6, y: 0.4 })
    expect(b.arrows).toEqual([{ id: 'b1', from: { x: 0.1, y: 0.1 }, to: { x: 0.6, y: 0.4 } }])
  })

  it('短すぎる矢印（ただのタップ）は足さない', () => {
    const tiny = MIN_ARROW_LENGTH / 2
    expect(addArrow(emptyBoard, { x: 0.5, y: 0.5 }, { x: 0.5 + tiny, y: 0.5 })).toBe(emptyBoard)
  })
})

describe('addArea', () => {
  it('どの対角から引いても x0 ≤ x1、y0 ≤ y1 にそろえる', () => {
    const b = addArea(emptyBoard, 'defend', { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.55 })
    expect(b.areas[0]).toMatchObject({ kind: 'defend', x0: 0.2, y0: 0.55, x1: 0.8, y1: 0.9 })
  })

  it('小さすぎる範囲は足さない', () => {
    const small = MIN_AREA_SIZE / 2
    expect(addArea(emptyBoard, 'attack', { x: 0.1, y: 0.1 }, { x: 0.1 + small, y: 0.6 })).toBe(emptyBoard)
  })

  it('守る範囲と打つ範囲を区別して持つ', () => {
    let b = addArea(emptyBoard, 'defend', { x: 0, y: 0.5 }, { x: 0.5, y: 1 })
    b = addArea(b, 'attack', { x: 0.5, y: 0 }, { x: 1, y: 0.5 })
    expect(b.areas.map((a) => a.kind)).toEqual(['defend', 'attack'])
  })
})

describe('removeItem・clearDrawings', () => {
  const base = () => {
    let b = addPiece(emptyBoard, 7, '')
    b = addArrow(b, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 })
    b = addArea(b, 'defend', { x: 0.1, y: 0.6 }, { x: 0.5, y: 0.95 })
    return b
  }

  it('id を指定して、駒・矢印・範囲のどれでも 1 つ消す', () => {
    const b = base()
    expect(removeItem(b, 'b1').pieces).toHaveLength(0)
    expect(removeItem(b, 'b2').arrows).toHaveLength(0)
    expect(removeItem(b, 'b3').areas).toHaveLength(0)
    expect(removeItem(b, 'b2').pieces).toHaveLength(1)
  })

  it('矢印と範囲だけを消し、駒は残す', () => {
    const b = clearDrawings(base())
    expect(b.pieces).toHaveLength(1)
    expect(b.arrows).toHaveLength(0)
    expect(b.areas).toHaveLength(0)
  })
})

describe('clamp01', () => {
  it('0〜1 に収める', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(2)).toBe(1)
  })
})
