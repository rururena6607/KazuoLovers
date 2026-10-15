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
}

export interface Match {
  id: string
  teamId: string
  kind: 'match' | 'practice'
  /** 練習は null */
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
}
