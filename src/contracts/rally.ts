// 得点とサーブ権（要件定義書 6 章「得点とサーブ権」）。実装は lib/rally（とりはる）。
import type { PlayRecord, PointCause, Side } from './records.ts'

export interface RallyState {
  ourScore: number
  oppScore: number
  serving: Side
}

/** 結果だけで得点が決まる記録なら、どちらに何の理由で入るかを返す。ラリーが続くなら null */
export type PointFor = (rec: PlayRecord) => { side: Side; cause: PointCause } | null

/** 得点を1つ足したあとの状態を返す。サーブ権も得点した側に移す */
export type ApplyPoint = (state: RallyState, side: Side) => RallyState

/** セットが終わったか。点数に達して2点差がついたら true */
export type IsSetOver = (state: RallyState, setPoints: number) => boolean
