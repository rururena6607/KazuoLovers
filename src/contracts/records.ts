// 1本ごとの記録。要件定義書 7 章のテーブル（serves・receptions・attacks・points）と同じ形。
// 座標はすべて記録する側から見た向きで、x は左端 0.0〜右端 1.0、y はネット側 0.0〜エンドライン 1.0。

/** サーブの種類（要件定義書 5 章「サーブの種類」） */
export type ServeType = 'float' | 'jump_float' | 'jump' | 'other'

/** レシーブ評価。A＝優、B＝良、C・D＝失敗（要件定義書 5 章） */
export type Grade = 'A' | 'B' | 'C' | 'D'

export type ServeResult = 'ace' | 'in' | 'miss'
export type MissType = 'net' | 'out' | 'other'

/** 自チームのサーブ1本 */
export interface ServeRecord {
  kind: 'serve'
  clientId: string
  setId: string
  serverId: string
  serveType: ServeType
  /** 自コートのエンドライン上の打った位置 */
  fromX: number | null
  /** 相手コートの着弾点。アウトは範囲外（例：1.1）も許す。ネットは null */
  toX: number | null
  toY: number | null
  result: ServeResult
  /** result が miss のときだけ */
  missType: MissType | null
  /** 試合で result が in のときだけ。練習では null */
  reception: Grade | null
  /** 受けた相手選手（opponent_players の id）。任意 */
  receiverId: string | null
  /** 練習モードで狙ったゾーン。試合では null */
  targetZone: number | null
  /** ISO 8601 */
  recordedAt: string
}

export type ReceptionResult = 'ace' | Grade | 'opp_miss'

/** 相手のサーブ1本と、自チームのレシーブ */
export interface ReceptionRecord {
  kind: 'reception'
  clientId: string
  setId: string
  /** 受けた自チームの選手（players の id）。相手ミスなら null */
  receiverId: string | null
  /** 相手サーバー（opponent_players の id）。任意 */
  oppServerId: string | null
  oppServeType: ServeType | null
  /** 自コートでレシーバーが触った位置。任意 */
  atX: number | null
  atY: number | null
  /** ace は被エース */
  result: ReceptionResult
  recordedAt: string
}

export type AttackType = 'left' | 'center' | 'right' | 'back' | 'other'
/** kill＝決定（得点）、continue＝継続、error＝ミス（失点）、blocked＝被ブロック（失点） */
export type AttackResult = 'kill' | 'continue' | 'error' | 'blocked'

/** 自チームのアタック1本 */
export interface AttackRecord {
  kind: 'attack'
  clientId: string
  setId: string
  attackerId: string
  attackType: AttackType | null
  isBack: boolean
  toX: number | null
  toY: number | null
  result: AttackResult
  /** サーブレシーブからの攻撃なら、そのレシーブの評価。ラリー中の切り返しなら null */
  prevReception: Grade | null
  recordedAt: string
}

export type Side = 'us' | 'opp'

export type PointCause =
  | 'ace' // 自チームのサービスエース
  | 'serve_miss' // 自チームのサーブミス
  | 'opp_miss' // 相手のサーブミス
  | 'aced' // 被エース
  | 'kill' // 自チームのアタック決定
  | 'attack_error' // 自チームのアタックミス
  | 'blocked' // 自チームの被ブロック
  | 'manual' // 得点の数字をタップ

/** 1点ずつの得点 */
export interface PointRecord {
  kind: 'point'
  clientId: string
  setId: string
  side: Side
  cause: PointCause
  /** 元になったサーブ・レシーブ・アタックの clientId。manual なら null */
  sourceId: string | null
  /** その1点が入ったあとの得点 */
  ourScore: number
  oppScore: number
  recordedAt: string
}

export type PlayRecord = ServeRecord | ReceptionRecord | AttackRecord
export type AnyRecord = PlayRecord | PointRecord
