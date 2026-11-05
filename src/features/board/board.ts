// 作戦ボード（F-23）の中身。画面（BoardScreen）から使う純粋な関数だけを置く。
// コートは縦向きの全面：上が相手コート、下が自チームのコート、真ん中がネット。
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

/** 相手の駒の id（ポジション 1〜6） */
export const oppPieceId = (pos: number) => `opp-${pos}`

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

/** コートの外に出さない（余白の中までは置ける） */
export const clampPoint = (p: Point): Point => ({
  x: Math.min(BOARD_W, Math.max(0, p.x)),
  y: Math.min(BOARD_H, Math.max(0, p.y)),
})

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
  /** 動かした駒の位置（選手の id または opp-1〜6）。ないものは基本の立ち位置 */
  moved: Readonly<Record<string, Point>>
  showOpp: boolean
  shapes: readonly Shape[]
}

export const EMPTY_BOARD: BoardState = { lineup: EMPTY_LINEUP, moved: {}, showOpp: false, shapes: [] }

/** 駒の今の位置 */
export function pieceAt(state: BoardState, pieceId: string): Point | null {
  const moved = state.moved[pieceId]
  if (moved) return moved
  const ours = state.lineup.indexOf(pieceId)
  if (ours !== -1) return OUR_SPOTS[ours] ?? null
  const m = /^opp-([1-6])$/.exec(pieceId)
  return m ? (OPP_SPOTS[Number(m[1]) - 1] ?? null) : null
}

/** ローテーションしたら、駒は基本の立ち位置に戻す（動かした位置は前のローテのもの） */
export const rotateBoard = (state: BoardState, back = false): BoardState => ({
  ...state,
  lineup: rotate(state.lineup, back),
  moved: {},
})

/** 自チームのコートの外枠（描くときに使う） */
export const COURT = { x: MARGIN, y: MARGIN, width: COURT_W, height: BOARD_H - MARGIN * 2 }
