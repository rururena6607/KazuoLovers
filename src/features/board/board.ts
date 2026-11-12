// 作戦ボード（F-23）の中身。画面（BoardScreen）から使う純粋な関数だけを置く。
// 座標は縦向きの全面（上が相手コート、下が自チームのコート、真ん中がネット）で持ち、
// 画面には半面ずつ大きく出す（自チーム／相手を切り替える）。それぞれの駒と図は切り替えても残る。
// 端末の中だけで動き、保存しない（説明に使ってすぐ消せるもの。監督の要望）。

/** コート全体の座標（9m × 18m を 10 倍、まわりに 5 の余白） */
export const BOARD_W = 100
export const BOARD_H = 190
export const NET_Y = 95
const MARGIN = 5
const COURT_W = 90
/** アタックライン（ネットから 3m） */
export const ATTACK_LINE = 30

export interface Point {
  x: number
  y: number
}

/** ポジション 1〜6 のときの、6人の並び（lineup[0] がポジション1の選手）。空きは null */
export type Lineup = readonly (string | null)[]

export const EMPTY_LINEUP: Lineup = [null, null, null, null, null, null]

/**
 * 自チームの基本の立ち位置（ネットを上に見て、前衛は左から 4・3・2、後衛は 5・6・1）。
 * 添字はポジション − 1
 */
export const OUR_SPOTS: readonly Point[] = [
  { x: 80, y: 155 }, // 1 後衛ライト
  { x: 80, y: 113 }, // 2 前衛ライト
  { x: 50, y: 113 }, // 3 前衛センター
  { x: 20, y: 113 }, // 4 前衛レフト
  { x: 20, y: 155 }, // 5 後衛レフト
  { x: 50, y: 155 }, // 6 後衛センター
]

/** 相手の基本の立ち位置。相手はネットを下に見るので、自チームを上下・左右に返した位置 */
export const OPP_SPOTS: readonly Point[] = OUR_SPOTS.map((p) => ({ x: BOARD_W - p.x, y: BOARD_H - p.y }))

/** 相手の駒。背番号で出す（足す・番号を変える・外すができる） */
export interface OppPiece {
  id: string
  number: number
}

/**
 * ローテーション（サイドアウトで時計回り）：ポジション2の選手が1へ、1が6へ…3が2へ。
 * back が true なら1つ戻す
 */
export function rotate(lineup: Lineup, back = false): Lineup {
  const n = lineup.length
  return lineup.map((_, i) => (back ? lineup[(i - 1 + n) % n] : lineup[(i + 1) % n]) ?? null)
}

/**
 * スタメンを選ぶ。並びにいなければ最初の空きに入れ、いれば外す。
 * 空きがなければそのまま
 */
export function togglePlayer(lineup: Lineup, playerId: string): Lineup {
  if (lineup.includes(playerId)) return lineup.map((id) => (id === playerId ? null : id))
  const empty = lineup.indexOf(null)
  if (empty === -1) return lineup
  return lineup.map((id, i) => (i === empty ? playerId : id))
}

/** 画面に出す半面。自チームのコートか、相手のコートか */
export type HalfSide = 'ours' | 'opp'

/**
 * 半面の範囲（全面の座標のうち、画面に出す部分）。どちらもネットとその少し向こうまで入れる。
 * 相手のコートはネットが下に来る（自チームの側から見た向き）
 */
export function halfBounds(side: HalfSide) {
  const height = NET_Y + MARGIN
  return { x: 0, y: side === 'ours' ? BOARD_H - height : 0, width: BOARD_W, height }
}

/** 出している半面の外に出さない（駒やエリアが見えなくならないように） */
export function clampPoint(p: Point, side: HalfSide): Point {
  const b = halfBounds(side)
  return {
    x: Math.min(b.x + b.width, Math.max(b.x, p.x)),
    y: Math.min(b.y + b.height, Math.max(b.y, p.y)),
  }
}

export type AreaTone = 'defend' | 'attack'

export type Shape =
  | { id: string; kind: 'arrow'; from: Point; to: Point }
  | { id: string; kind: 'area'; tone: AreaTone; from: Point; to: Point }

/** 短すぎる矢印・エリアは、指が少し動いただけなので作らない */
export const MIN_SHAPE = 4

export const isBigEnough = (from: Point, to: Point): boolean =>
  Math.hypot(to.x - from.x, to.y - from.y) >= MIN_SHAPE

/** エリアのだ円。ドラッグした2点を対角とする長方形に収まる（どちらの点から引いてもよい） */
export const ellipseOf = (from: Point, to: Point) => ({
  cx: (from.x + to.x) / 2,
  cy: (from.y + to.y) / 2,
  rx: Math.abs(to.x - from.x) / 2,
  ry: Math.abs(to.y - from.y) / 2,
})

export interface BoardState {
  lineup: Lineup
  /** 動かした駒の位置（選手の id または相手の駒の id）。ないものは基本の立ち位置 */
  moved: Readonly<Record<string, Point>>
  /** 相手の駒。足した順に、相手のポジション 1〜6 の立ち位置に置く */
  opp: readonly OppPiece[]
  /** 矢印・エリア。全面の座標で持つので、描いた半面を出したときだけ見える */
  shapes: readonly Shape[]
}

export const EMPTY_BOARD: BoardState = { lineup: EMPTY_LINEUP, moved: {}, opp: [], shapes: [] }

/**
 * 相手の駒を足す。すでに同じ背番号があれば足さない。
 * 7つ目からも足せる（交代の説明用）。置く場所は立ち位置を順にくり返す
 */
export function addOpp(state: BoardState, number: number, id: string): BoardState {
  if (state.opp.some((o) => o.number === number)) return state
  return { ...state, opp: [...state.opp, { id, number }] }
}

/** 相手の駒の背番号を変える。ほかの駒と同じ番号にはしない */
export function renumberOpp(state: BoardState, id: string, number: number): BoardState {
  if (state.opp.some((o) => o.number === number && o.id !== id)) return state
  return { ...state, opp: state.opp.map((o) => (o.id === id ? { ...o, number } : o)) }
}

/** 相手の駒を外す（動かした位置も消す） */
export function removeOpp(state: BoardState, id: string): BoardState {
  const moved = Object.fromEntries(Object.entries(state.moved).filter(([k]) => k !== id))
  return { ...state, opp: state.opp.filter((o) => o.id !== id), moved }
}

/** 駒の今の位置 */
export function pieceAt(state: BoardState, pieceId: string): Point | null {
  const moved = state.moved[pieceId]
  if (moved) return moved
  const ours = state.lineup.indexOf(pieceId)
  if (ours !== -1) return OUR_SPOTS[ours] ?? null
  const opp = state.opp.findIndex((o) => o.id === pieceId)
  return opp === -1 ? null : (OPP_SPOTS[opp % OPP_SPOTS.length] ?? null)
}

/** ローテーションしたら、駒は基本の立ち位置に戻す（動かした位置は前のローテのもの） */
export const rotateBoard = (state: BoardState, back = false): BoardState => ({
  ...state,
  lineup: rotate(state.lineup, back),
  moved: {},
})

/** 自チームのコートの外枠（描くときに使う） */
export const COURT = { x: MARGIN, y: MARGIN, width: COURT_W, height: BOARD_H - MARGIN * 2 }

/** 矢印・エリアがどちらの半面のものか（真ん中の点がネットのどちら側にあるか） */
export const shapeSide = (s: Shape): HalfSide => ((s.from.y + s.to.y) / 2 < NET_Y ? 'opp' : 'ours')

/** その半面の図だけを消す（もう片方の半面の図は残す） */
export const clearShapes = (state: BoardState, side: HalfSide): BoardState => ({
  ...state,
  shapes: state.shapes.filter((s) => shapeSide(s) !== side),
})

/** その半面の駒だけを基本の立ち位置に戻す */
export function resetMoved(state: BoardState, side: HalfSide): BoardState {
  const ids = new Set(side === 'ours' ? state.lineup.filter((id) => id !== null) : state.opp.map((o) => o.id))
  return { ...state, moved: Object.fromEntries(Object.entries(state.moved).filter(([k]) => !ids.has(k))) }
}
