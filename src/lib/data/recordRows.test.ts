import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  PointRecord,
  ReceptionRecord,
  ServeRecord,
} from '../../contracts/index.ts'
import {
  COLUMNS,
  attackFromRow,
  pointFromRow,
  receptionFromRow,
  serveFromRow,
  toRow,
  type AttackRow,
  type PointRow,
  type ReceptionRow,
  type ServeRow,
} from './recordRows.ts'

const serve: ServeRecord = {
  kind: 'serve',
  clientId: 'c-serve',
  setId: 's1',
  serverId: 'p7',
  serveType: 'jump_float',
  fromX: 0.5,
  toX: 1.1,
  toY: 0.8,
  result: 'miss',
  missType: 'out',
  reception: null,
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-10-15T10:00:01.000Z',
}

const reception: ReceptionRecord = {
  kind: 'reception',
  clientId: 'c-rec',
  setId: 's1',
  receiverId: 'p3',
  oppServerId: 'o12',
  oppServeType: 'float',
  atX: 0.3,
  atY: 0.7,
  result: 'B',
  recordedAt: '2026-10-15T10:00:02.000Z',
}

const attack: AttackRecord = {
  kind: 'attack',
  clientId: 'c-atk',
  setId: 's1',
  attackerId: 'p9',
  attackType: 'back',
  isBack: true,
  toX: 0.2,
  toY: 0.9,
  result: 'kill',
  prevReception: 'A',
  recordedAt: '2026-10-15T10:00:03.000Z',
}

const point: PointRecord = {
  kind: 'point',
  clientId: 'c-pt',
  setId: 's1',
  side: 'us',
  cause: 'kill',
  sourceId: 'c-atk',
  ourScore: 5,
  oppScore: 3,
  recordedAt: '2026-10-15T10:00:04.000Z',
}

/** 行の列が COLUMNS と同じか（select で選ぶ列と、送る列がずれないように） */
const columnsOf = (row: object) => Object.keys(row).sort().join(',')
const sorted = (cols: string) => cols.split(',').sort().join(',')

describe('toRow と fromRow', () => {
  it('サーブは serves の行になり、元に戻せる', () => {
    const { table, row } = toRow(serve)
    expect(table).toBe('serves')
    expect(row).toMatchObject({ client_id: 'c-serve', server_id: 'p7', to_x: 1.1, miss_type: 'out' })
    expect(columnsOf(row)).toBe(sorted(COLUMNS.serves))
    expect(serveFromRow(row as ServeRow)).toEqual(serve)
  })

  it('レシーブは receptions の行になり、元に戻せる', () => {
    const { table, row } = toRow(reception)
    expect(table).toBe('receptions')
    expect(row).toMatchObject({ receiver_id: 'p3', opp_server_id: 'o12', result: 'B' })
    expect(columnsOf(row)).toBe(sorted(COLUMNS.receptions))
    expect(receptionFromRow(row as ReceptionRow)).toEqual(reception)
  })

  it('アタックは attacks の行になり、元に戻せる', () => {
    const { table, row } = toRow(attack)
    expect(table).toBe('attacks')
    expect(row).toMatchObject({ attacker_id: 'p9', is_back: true, prev_reception: 'A' })
    expect(columnsOf(row)).toBe(sorted(COLUMNS.attacks))
    expect(attackFromRow(row as AttackRow)).toEqual(attack)
  })

  it('得点は points の行になり、元に戻せる', () => {
    const { table, row } = toRow(point)
    expect(table).toBe('points')
    expect(row).toMatchObject({ side: 'us', source_id: 'c-atk', our_score: 5, opp_score: 3 })
    expect(columnsOf(row)).toBe(sorted(COLUMNS.points))
    expect(pointFromRow(row as PointRow)).toEqual(point)
  })

  it('Supabase が返す +00:00 の時刻を、端末と同じ …Z の形にそろえる', () => {
    const row = { ...(toRow(point).row as PointRow), recorded_at: '2026-10-15T19:00:04+09:00' }
    expect(pointFromRow(row).recordedAt).toBe('2026-10-15T10:00:04.000Z')
  })
})
