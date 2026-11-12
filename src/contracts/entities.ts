// チーム・選手・試合など、記録の前に管理画面で作るもの。要件定義書 7 章。
import type { ServeType } from './records.ts'

export interface Team {
  id: string
  name: string
}

/** 自チームの選手 */
export interface Player {
  id: string
  teamId: string
  number: number
  name: string
  position: string | null
  /** いつものサーブの種類。記録画面で最初から選んでおく */
  serveType: ServeType
  /** 引退した選手は false */
  active: boolean
}

export interface Opponent {
  id: string
  teamId: string
  name: string
}

/** 相手選手。背番号だけで管理する */
export interface OpponentPlayer {
  id: string
  opponentId: string
  number: number
  /**
   * 紅白戦のときだけ、この選手にあたる自チームの選手（players の id）。
   * これで、B チームの記録も、その部員個人の成績に入れられる。ふつうの試合は null か未設定
   */
  playerId?: string | null
}

export interface Match {
  id: string
  teamId: string
  /**
   * match＝ふつうの試合、practice＝サーブ練習、
   * scrimmage＝部内の紅白戦（両チームとも自チームの選手。B チームは opponentId の相手チームとして持つ）。
   * B チームの相手チームは、試合ごとに作る前提（使い回すと、顔ぶれが変わったとき playerId の対応がずれる。docs 12章で未決）
   */
  kind: 'match' | 'practice' | 'scrimmage'
  /** 練習は null。紅白戦は B チームを表す相手チーム（名前の既定は「紅白戦（B チーム）」） */
  opponentId: string | null
  /** YYYY-MM-DD */
  date: string
  tournament: string | null
  /** 1セットの点数（例：25）。最終セットは config の FINAL_SET_POINTS */
  setPoints: number
}

export interface GameSet {
  id: string
  matchId: string
  setNo: number
  ourScore: number
  oppScore: number
  /**
   * 相手コートの列の境目（0.0〜1.0。左の列と中の列、中の列と右の列の間）。セットごとに動かせる。
   * 未設定のときは config の DEFAULT_COL_SPLITS（3 等分）。
   * 0 ≤ colSplit1 < colSplit2 ≤ 1 を守る。片方だけ設定するのは不可（両方そろえて設定するか、両方未設定）
   */
  colSplit1?: number
  colSplit2?: number
}
