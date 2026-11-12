// 1本ごとの記録。要件定義書 7 章のテーブル（serves・receptions・attacks・points）と同じ形。
// 座標はすべて記録する側から見た向きで、x は左端 0.0〜右端 1.0、y はネット側 0.0〜エンドライン 1.0。

/** サーブの種類（要件定義書 5 章「サーブの種類」） */
export type ServeType = 'float' | 'jump_float' | 'jump' | 'other'

/** ボールの速さ（サーブ・アタックの任意項目）。速い・遅いの 2 段階 */
export type Speed = 'fast' | 'slow'

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
  /** サーブの速さ。任意。ない（古い記録・入れなかった）ときは null か未設定 */
  speed?: Speed | null
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
  /** 打った位置（矢印の始点）。任意。自コート上の座標 */
  fromX?: number | null
  fromY?: number | null
  /** 打った方向（矢印の終点）。相手コート上の座標 */
  toX: number | null
  toY: number | null
  /** アタックの速さ。任意 */
  speed?: Speed | null
  result: AttackResult
  /** サーブレシーブからの攻撃なら、そのレシーブの評価。ラリー中の切り返しなら null */
  prevReception: Grade | null
  recordedAt: string
}

/**
 * 相手のスパイク1本と、自チームのレシーブ（ディグ）。
 * killed＝拾えず相手の得点、A〜D＝拾えた（サーブレシーブと同じ評価）、opp_error＝相手のアタックミス（自チームの得点）
 */
export type OppAttackResult = 'killed' | Grade | 'opp_error'

export interface OppAttackRecord {
  kind: 'opp_attack'
  clientId: string
  setId: string
  /** 打った相手選手（opponent_players の id）。任意 */
  hitterId: string | null
  /** 拾った（触った）自チームの選手（players の id）。killed・opp_error なら null でもよい */
  diggerId: string | null
  /** 相手が打った位置（矢印の始点）。相手コート上の座標。任意 */
  fromX: number | null
  fromY: number | null
  /** 落ちた位置・拾った位置（矢印の終点）。自コート上の座標。任意 */
  toX: number | null
  toY: number | null
  speed: Speed | null
  result: OppAttackResult
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
  | 'opp_kill' // 相手のアタック決定（拾えず失点）
  | 'opp_attack_error' // 相手のアタックミス（自チームの得点）
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

export type PlayRecord = ServeRecord | ReceptionRecord | AttackRecord | OppAttackRecord
export type AnyRecord = PlayRecord | PointRecord
