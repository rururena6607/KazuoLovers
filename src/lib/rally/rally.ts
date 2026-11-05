// 得点とサーブ権の更新（要件定義書 6 章「得点とサーブ権」）。T-08。
import {
  SET_WIN_MARGIN,
  type ApplyPoint,
  type IsSetOver,
  type PointFor,
  type RallyState,
  type Side,
} from '../../contracts/index.ts'

const unreachable = (value: never): never => {
  throw new Error(`未対応の結果です：${String(value)}`)
}

/**
 * 結果だけで得点が決まる記録の、得点する側と理由。
 * サーブ・レシーブが A〜D、アタックの継続は、ラリーが続くので null（得点の数字のタップで入れる）。
 * 練習モードのサーブ（targetZone がある）には得点がないので、必ず null。
 */
export const pointFor: PointFor = (rec) => {
  switch (rec.kind) {
    case 'serve': {
      if (rec.targetZone !== null) return null
      const result = rec.result
      switch (result) {
        case 'ace':
          return { side: 'us', cause: 'ace' }
        case 'miss':
          return { side: 'opp', cause: 'serve_miss' }
        case 'in':
          return null
        default:
          return unreachable(result)
      }
    }
    case 'reception': {
      const result = rec.result
      switch (result) {
        case 'opp_miss':
          return { side: 'us', cause: 'opp_miss' }
        case 'ace':
          return { side: 'opp', cause: 'aced' }
        case 'A':
        case 'B':
        case 'C':
        case 'D':
          return null
        default:
          return unreachable(result)
      }
    }
    case 'attack': {
      const result = rec.result
      switch (result) {
        case 'kill':
          return { side: 'us', cause: 'kill' }
        case 'error':
          return { side: 'opp', cause: 'attack_error' }
        case 'blocked':
          return { side: 'opp', cause: 'blocked' }
        case 'continue':
          return null
        default:
          return unreachable(result)
      }
    }
  }
}

/** 得点を1つ足す。サーブ権も得点した側に移す */
export const applyPoint: ApplyPoint = (state, side) => ({
  ourScore: state.ourScore + (side === 'us' ? 1 : 0),
  oppScore: state.oppScore + (side === 'opp' ? 1 : 0),
  serving: side,
})

/** サーブ権の切替ボタン */
export const toggleServing = (state: RallyState): RallyState => ({
  ...state,
  serving: state.serving === 'us' ? 'opp' : 'us',
})

/** セットの点数は正の整数。0・負の数・NaN だとセットが終わらない／すぐ終わるので、例外にする */
function assertSetPoints(setPoints: number): void {
  if (!Number.isInteger(setPoints) || setPoints <= 0) {
    throw new RangeError(`セットの点数は正の整数にしてください：${String(setPoints)}`)
  }
}

/** セットに勝った側。点数に達して点差がついていなければ null */
export const setWinner = (state: RallyState, setPoints: number): Side | null => {
  assertSetPoints(setPoints)
  const lead = state.ourScore - state.oppScore
  if (Math.max(state.ourScore, state.oppScore) < setPoints) return null
  if (lead >= SET_WIN_MARGIN) return 'us'
  if (lead <= -SET_WIN_MARGIN) return 'opp'
  return null
}

/** セットが終わったか。点数に達して2点差がついたら true */
export const isSetOver: IsSetOver = (state, setPoints) => setWinner(state, setPoints) !== null

/**
 * セットが終わっていれば状態を変えずに返し、終わっていなければ得点を足す。
 * 「セット終了」を確認する前の連打で、25-23 のあとに 26-23 の記録を作らないために使う
 */
export const applyPointInSet = (state: RallyState, side: Side, setPoints: number): RallyState =>
  isSetOver(state, setPoints) ? state : applyPoint(state, side)
