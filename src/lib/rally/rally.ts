// 得点とサーブ権の更新（要件定義書 6 章「得点とサーブ権」）。T-08。
import {
  SET_WIN_MARGIN,
  type ApplyPoint,
  type IsSetOver,
  type PointFor,
  type RallyState,
  type Side,
} from '../../contracts/index.ts'

/**
 * 結果だけで得点が決まる記録の、得点する側と理由。
 * サーブ・レシーブがA〜D、アタックの継続はラリーが続くので null（得点の数字のタップで入れる）。
 * 練習モードのサーブには得点がないので、呼ぶ側で除く。
 */
export const pointFor: PointFor = (rec) => {
  switch (rec.kind) {
    case 'serve':
      if (rec.result === 'ace') return { side: 'us', cause: 'ace' }
      if (rec.result === 'miss') return { side: 'opp', cause: 'serve_miss' }
      return null
    case 'reception':
      if (rec.result === 'opp_miss') return { side: 'us', cause: 'opp_miss' }
      if (rec.result === 'ace') return { side: 'opp', cause: 'aced' }
      return null
    case 'attack':
      if (rec.result === 'kill') return { side: 'us', cause: 'kill' }
      if (rec.result === 'error') return { side: 'opp', cause: 'attack_error' }
      if (rec.result === 'blocked') return { side: 'opp', cause: 'blocked' }
      return null
  }
}

/** 得点を1つ足す。サーブ権も得点した側に移す */
export const applyPoint: ApplyPoint = (state, side) => ({
  ourScore: state.ourScore + (side === 'us' ? 1 : 0),
  oppScore: state.oppScore + (side === 'opp' ? 1 : 0),
  serving: side,
})

/** 得点の数字の長押しによる −1。0 未満にはならず、サーブ権は変えない */
export const revertPoint = (state: RallyState, side: Side): RallyState => ({
  ...state,
  ourScore: Math.max(0, state.ourScore - (side === 'us' ? 1 : 0)),
  oppScore: Math.max(0, state.oppScore - (side === 'opp' ? 1 : 0)),
})

/** サーブ権の切替ボタン */
export const toggleServing = (state: RallyState): RallyState => ({
  ...state,
  serving: state.serving === 'us' ? 'opp' : 'us',
})

/** セットに勝った側。点数に達して点差がついていなければ null */
export const setWinner = (state: RallyState, setPoints: number): Side | null => {
  const lead = state.ourScore - state.oppScore
  if (Math.max(state.ourScore, state.oppScore) < setPoints) return null
  if (lead >= SET_WIN_MARGIN) return 'us'
  if (lead <= -SET_WIN_MARGIN) return 'opp'
  return null
}

/** セットが終わったか。点数に達して2点差がついたら true */
export const isSetOver: IsSetOver = (state, setPoints) => setWinner(state, setPoints) !== null
