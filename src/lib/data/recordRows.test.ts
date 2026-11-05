import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  OppAttackRecord,
  PointRecord,
  ReceptionRecord,
  ServeRecord,
} from '../../contracts/index.ts'
import {
  COLUMNS,
  attackFromRow,
  emptySetRecords,
  oppAttackFromRow,
  pointFromRow,
  receptionFromRow,
  recordFromRow,
  serveFromRow,
  toRow,
  type AttackRow,
  type OppAttackRow,
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
  speed: 'fast',
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
  fromX: 0.4,
  fromY: 0.7,
  toX: 0.2,
  toY: 0.9,
  speed: 'slow',
  result: 'kill',
  prevReception: 'A',
  recordedAt: '2026-10-15T10:00:03.000Z',
}

const oppAttack: OppAttackRecord = {
  kind: 'opp_attack',
  clientId: 'c-opp',
  setId: 's1',
  hitterId: 'o4',
  diggerId: 'p5',
  fromX: 0.6,
  fromY: 0.1,
  toX: 0.3,
  toY: 1.1,
  speed: 'fast',
  result: 'C',
  recordedAt: '2026-11-05T10:00:05.000Z',
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
    expect(row).toMatchObject({ client_id: 'c-serve', server_id: 'p7', to_x: 1.1, miss_type: 'out', speed: 'fast' })
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
    expect(row).toMatchObject({
      attacker_id: 'p9',
      is_back: true,
      prev_reception: 'A',
      from_x: 0.4,
      from_y: 0.7,
      speed: 'slow',
    })
    expect(columnsOf(row)).toBe(sorted(COLUMNS.attacks))
    expect(attackFromRow(row as AttackRow)).toEqual(attack)
  })

  it('相手のスパイクは opp_attacks の行になり、元に戻せる（アウトの座標も保つ）', () => {
    const { table, row } = toRow(oppAttack)
    expect(table).toBe('opp_attacks')
    expect(row).toMatchObject({ hitter_id: 'o4', digger_id: 'p5', from_y: 0.1, to_y: 1.1, speed: 'fast', result: 'C' })
    expect(columnsOf(row)).toBe(sorted(COLUMNS.opp_attacks))
    expect(oppAttackFromRow(row as OppAttackRow)).toEqual(oppAttack)
    expect(recordFromRow('opp_attacks', row)).toEqual(oppAttack)
  })

  it('拾えず・選手や座標を入れなかった相手のスパイクも、空（null）のまま保たれる', () => {
    const bare: OppAttackRecord = {
      ...oppAttack,
      hitterId: null,
      diggerId: null,
      fromX: null,
      fromY: null,
      toX: null,
      toY: null,
      speed: null,
      result: 'killed',
    }
    const { row } = toRow(bare)
    expect(oppAttackFromRow(row as OppAttackRow)).toEqual(bare)
  })

  it('速さ・矢印を持たない古い記録（任意項目が未設定）は、空（null）の列として送る', () => {
    // contracts では任意（?）の項目。未設定の記録は、空（null）の列として送る
    const oldServe: ServeRecord = { ...serve, speed: undefined }
    const oldAttack: AttackRecord = { ...attack, fromX: undefined, fromY: undefined, speed: undefined }
    expect(toRow(oldServe).row).toMatchObject({ speed: null })
    expect(toRow(oldAttack).row).toMatchObject({ from_x: null, from_y: null, speed: null })
  })

  it('空のセットは、相手のスパイクの配列も持つ', () => {
    expect(emptySetRecords('s9')).toEqual({
      setId: 's9',
      serves: [],
      receptions: [],
      attacks: [],
      oppAttacks: [],
      points: [],
    })
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
