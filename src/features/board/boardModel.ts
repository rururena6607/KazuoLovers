// 作戦ボード（F-23）の盤面の操作。React にも通信にも依存しない純粋な関数。
// 座標は、コート全体（相手コート＋自コート）を 0.0〜1.0 で表す。
// x は左端 0.0〜右端 1.0、y は相手側のエンドライン 0.0〜自分側のエンドライン 1.0（ネットは 0.5）。

export interface Point {
  x: number
  y: number
}

/** 背番号と名前の駒。名前は空でもよい */
export interface Piece {
  id: string
  number: number
  name: string
  x: number
  y: number
}

export interface Arrow {
  id: string
  from: Point
  to: Point
}

/** 守る範囲（defend）と打つ範囲（attack）。x0 ≤ x1、y0 ≤ y1 */
export type AreaKind = 'defend' | 'attack'

export interface Area {
  id: string
  kind: AreaKind
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Board {
  pieces: Piece[]
  arrows: Arrow[]
  areas: Area[]
  /** 次に振る id の番号 */
  nextId: number
}

export const emptyBoard: Board = { pieces: [], arrows: [], areas: [], nextId: 1 }

/** 背番号の入力できる範囲。文書に決まりがないので、部の背番号に合わせて 0〜99 にしている */
export const MIN_PIECE_NUMBER = 0
export const MAX_PIECE_NUMBER = 99

/** 名前の長さの上限。駒の下に収まる長さ */
export const MAX_NAME_LENGTH = 4

/** これより短い矢印・小さいエリアは、ただのタップとして捨てる（コート全体を 1.0 とした長さ） */
export const MIN_ARROW_LENGTH = 0.04
export const MIN_AREA_SIZE = 0.03

/** 新しい駒を並べる位置（自コートの奥）。1 行に並べる数 */
const PIECES_PER_ROW = 6
const FIRST_ROW_Y = 0.9
const ROW_STEP_Y = 0.06

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

const clampPoint = (p: Point): Point => ({ x: clamp01(p.x), y: clamp01(p.y) })

/** 背番号の入力文字を数にする。半角・全角の数字だけを受け付け、範囲外は null */
export function parsePieceNumber(text: string): number | null {
  const half = text.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  if (!/^\d{1,2}$/.test(half)) return null
  const n = Number(half)
  return n >= MIN_PIECE_NUMBER && n <= MAX_PIECE_NUMBER ? n : null
}

const withId = (board: Board): [string, number] => [`b${board.nextId}`, board.nextId + 1]

/** 駒を足す。すでにある駒と重ならないよう、自コートの奥に順に並べる */
export function addPiece(board: Board, number: number, name: string): Board {
  const [id, nextId] = withId(board)
  const i = board.pieces.length
  const col = i % PIECES_PER_ROW
  const row = Math.floor(i / PIECES_PER_ROW)
  const piece: Piece = {
    id,
    number,
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    x: (col + 0.5) / PIECES_PER_ROW,
    y: clamp01(FIRST_ROW_Y - row * ROW_STEP_Y),
  }
  return { ...board, pieces: [...board.pieces, piece], nextId }
}

export function movePiece(board: Board, id: string, to: Point): Board {
  const p = clampPoint(to)
  return { ...board, pieces: board.pieces.map((pc) => (pc.id === id ? { ...pc, x: p.x, y: p.y } : pc)) }
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** 矢印を足す。短すぎるときは何も足さない */
export function addArrow(board: Board, from: Point, to: Point): Board {
  const a = clampPoint(from)
  const b = clampPoint(to)
  if (distance(a, b) < MIN_ARROW_LENGTH) return board
  const [id, nextId] = withId(board)
  return { ...board, arrows: [...board.arrows, { id, from: a, to: b }], nextId }
}

/** 対角の 2 点から範囲を足す。小さすぎるときは何も足さない */
export function addArea(board: Board, kind: AreaKind, a: Point, b: Point): Board {
  const p = clampPoint(a)
  const q = clampPoint(b)
  const area = {
    kind,
    x0: Math.min(p.x, q.x),
    y0: Math.min(p.y, q.y),
    x1: Math.max(p.x, q.x),
    y1: Math.max(p.y, q.y),
  }
  if (area.x1 - area.x0 < MIN_AREA_SIZE || area.y1 - area.y0 < MIN_AREA_SIZE) return board
  const [id, nextId] = withId(board)
  return { ...board, areas: [...board.areas, { id, ...area }], nextId }
}

/** 駒・矢印・範囲のどれでも、id で 1 つ消す */
export function removeItem(board: Board, id: string): Board {
  return {
    ...board,
    pieces: board.pieces.filter((x) => x.id !== id),
    arrows: board.arrows.filter((x) => x.id !== id),
    areas: board.areas.filter((x) => x.id !== id),
  }
}

/** 矢印と範囲だけ消す（駒は残す）。ローテーションを変えて描き直すときに使う */
export function clearDrawings(board: Board): Board {
  return { ...board, arrows: [], areas: [] }
}
