// 記録（contracts）と、テーブル（serves・receptions・attacks・points）の行との変換。
// 列は supabase/migrations の初期スキーマと同じ。id と created_by は Supabase が入れるので扱わない。
import type {
  AnyRecord,
  AttackRecord,
  PointRecord,
  ReceptionRecord,
  ServeRecord,
  SetRecords,
} from '../../contracts/index.ts'

export const TABLES = {
  serve: 'serves',
  reception: 'receptions',
  attack: 'attacks',
  point: 'points',
} as const

export type RecordTable = (typeof TABLES)[keyof typeof TABLES]

export interface ServeRow {
  client_id: string
  set_id: string
  server_id: string
  serve_type: ServeRecord['serveType']
  from_x: number | null
  to_x: number | null
  to_y: number | null
  target_zone: number | null
  result: ServeRecord['result']
  miss_type: ServeRecord['missType']
  reception: ServeRecord['reception']
  receiver_id: string | null
  recorded_at: string
}

export interface ReceptionRow {
  client_id: string
  set_id: string
  receiver_id: string | null
  opp_server_id: string | null
  opp_serve_type: ReceptionRecord['oppServeType']
  at_x: number | null
  at_y: number | null
  result: ReceptionRecord['result']
  recorded_at: string
}

export interface AttackRow {
  client_id: string
  set_id: string
  attacker_id: string
  attack_type: AttackRecord['attackType']
  is_back: boolean
  to_x: number | null
  to_y: number | null
  result: AttackRecord['result']
  prev_reception: AttackRecord['prevReception']
  recorded_at: string
}

export interface PointRow {
  client_id: string
  set_id: string
  side: PointRecord['side']
  cause: PointRecord['cause']
  source_id: string | null
  our_score: number
  opp_score: number
  recorded_at: string
}

export type RecordRow = ServeRow | ReceptionRow | AttackRow | PointRow

/** 選ぶ列。行の型と同じ */
export const COLUMNS: Record<RecordTable, string> = {
  serves:
    'client_id,set_id,server_id,serve_type,from_x,to_x,to_y,target_zone,result,miss_type,reception,receiver_id,recorded_at',
  receptions:
    'client_id,set_id,receiver_id,opp_server_id,opp_serve_type,at_x,at_y,result,recorded_at',
  attacks:
    'client_id,set_id,attacker_id,attack_type,is_back,to_x,to_y,result,prev_reception,recorded_at',
  points: 'client_id,set_id,side,cause,source_id,our_score,opp_score,recorded_at',
}

export function toRow(rec: AnyRecord): { table: RecordTable; row: RecordRow } {
  switch (rec.kind) {
    case 'serve':
      return {
        table: TABLES.serve,
        row: {
          client_id: rec.clientId,
          set_id: rec.setId,
          server_id: rec.serverId,
          serve_type: rec.serveType,
          from_x: rec.fromX,
          to_x: rec.toX,
          to_y: rec.toY,
          target_zone: rec.targetZone,
          result: rec.result,
          miss_type: rec.missType,
          reception: rec.reception,
          receiver_id: rec.receiverId,
          recorded_at: rec.recordedAt,
        },
      }
    case 'reception':
      return {
        table: TABLES.reception,
        row: {
          client_id: rec.clientId,
          set_id: rec.setId,
          receiver_id: rec.receiverId,
          opp_server_id: rec.oppServerId,
          opp_serve_type: rec.oppServeType,
          at_x: rec.atX,
          at_y: rec.atY,
          result: rec.result,
          recorded_at: rec.recordedAt,
        },
      }
    case 'attack':
      return {
        table: TABLES.attack,
        row: {
          client_id: rec.clientId,
          set_id: rec.setId,
          attacker_id: rec.attackerId,
          attack_type: rec.attackType,
          is_back: rec.isBack,
          to_x: rec.toX,
          to_y: rec.toY,
          result: rec.result,
          prev_reception: rec.prevReception,
          recorded_at: rec.recordedAt,
        },
      }
    case 'point':
      return {
        table: TABLES.point,
        row: {
          client_id: rec.clientId,
          set_id: rec.setId,
          side: rec.side,
          cause: rec.cause,
          source_id: rec.sourceId,
          our_score: rec.ourScore,
          opp_score: rec.oppScore,
          recorded_at: rec.recordedAt,
        },
      }
  }
}

/** Supabase は '2026-10-15T10:00:01+00:00' の形で返すので、端末で作る ISO 8601（…Z）にそろえる */
const iso = (t: string) => new Date(t).toISOString()

export function serveFromRow(r: ServeRow): ServeRecord {
  return {
    kind: 'serve',
    clientId: r.client_id,
    setId: r.set_id,
    serverId: r.server_id,
    serveType: r.serve_type,
    fromX: r.from_x,
    toX: r.to_x,
    toY: r.to_y,
    result: r.result,
    missType: r.miss_type,
    reception: r.reception,
    receiverId: r.receiver_id,
    targetZone: r.target_zone,
    recordedAt: iso(r.recorded_at),
  }
}

export function receptionFromRow(r: ReceptionRow): ReceptionRecord {
  return {
    kind: 'reception',
    clientId: r.client_id,
    setId: r.set_id,
    receiverId: r.receiver_id,
    oppServerId: r.opp_server_id,
    oppServeType: r.opp_serve_type,
    atX: r.at_x,
    atY: r.at_y,
    result: r.result,
    recordedAt: iso(r.recorded_at),
  }
}

export function attackFromRow(r: AttackRow): AttackRecord {
  return {
    kind: 'attack',
    clientId: r.client_id,
    setId: r.set_id,
    attackerId: r.attacker_id,
    attackType: r.attack_type,
    isBack: r.is_back,
    toX: r.to_x,
    toY: r.to_y,
    result: r.result,
    prevReception: r.prev_reception,
    recordedAt: iso(r.recorded_at),
  }
}

export function pointFromRow(r: PointRow): PointRecord {
  return {
    kind: 'point',
    clientId: r.client_id,
    setId: r.set_id,
    side: r.side,
    cause: r.cause,
    sourceId: r.source_id,
    ourScore: r.our_score,
    oppScore: r.opp_score,
    recordedAt: iso(r.recorded_at),
  }
}

export const emptySetRecords = (setId: string): SetRecords => ({
  setId,
  serves: [],
  receptions: [],
  attacks: [],
  points: [],
})
