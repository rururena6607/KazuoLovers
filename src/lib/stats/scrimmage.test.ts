import { describe, expect, it } from 'vitest'
import type {
  OppAttackRecord,
  OppAttackResult,
  ReceptionRecord,
  ReceptionResult,
  ServeRecord,
} from '../../contracts/index.ts'
import { attackStatsOf, receptionStatsOfResults, serveStatsOf } from './metrics.ts'
import { bTeamAttacks, bTeamReceptions, bTeamServes, oppPlayerMapOf } from './scrimmage.ts'

// Bチームの相手選手 b7 は部員 p7、b8 は部員 p8。b9 は部員と結ばれていない
const members = oppPlayerMapOf([
  { id: 'b7', playerId: 'p7' },
  { id: 'b8', playerId: 'p8' },
  { id: 'b9', playerId: null },
  { id: 'b10' },
])

const reception = (result: ReceptionResult, oppServerId: string | null, id = 'r'): ReceptionRecord => ({
  kind: 'reception',
  clientId: id,
  setId: 's1',
  receiverId: result === 'opp_miss' ? null : 'p1',
  oppServerId,
  oppServeType: null,
  atX: null,
  atY: null,
  result,
  recordedAt: '2026-11-05T00:00:00Z',
})

const serve = (o: Partial<ServeRecord>): ServeRecord => ({
  kind: 'serve',
  clientId: 's',
  setId: 's1',
  serverId: 'p1',
  serveType: 'float',
  fromX: 0.5,
  toX: 0.5,
  toY: 0.5,
  result: 'in',
  missType: null,
  reception: 'A',
  receiverId: null,
  targetZone: null,
  recordedAt: '2026-11-05T00:00:00Z',
  ...o,
})

const opp = (result: OppAttackResult, hitterId: string | null): OppAttackRecord => ({
  kind: 'opp_attack',
  clientId: 'o',
  setId: 's1',
  hitterId,
  diggerId: null,
  fromX: null,
  fromY: null,
  toX: null,
  toY: null,
  speed: null,
  result,
  recordedAt: '2026-11-05T00:00:00Z',
})

describe('oppPlayerMapOf', () => {
  it('playerId を持つ相手選手だけを結ぶ', () => {
    expect([...members]).toEqual([
      ['b7', 'p7'],
      ['b8', 'p8'],
    ])
  })
})

describe('bTeamServes（Aのサーブレシーブから。相手サーバーが部員と結ばれている記録だけ）', () => {
  // 部員 p7 のサーブ 4 本：被エース1（エース）・C1・D1（効果2）・相手ミス1（ミス）…と、A1（効果なし）
  // →（100 ＋ 25 × 2 − 25）÷ 5 = 25%
  const receptions = [
    reception('ace', 'b7', 'r1'),
    reception('C', 'b7', 'r2'),
    reception('D', 'b7', 'r3'),
    reception('opp_miss', 'b7', 'r4'),
    reception('A', 'b7', 'r5'),
    reception('ace', null, 'r6'), // 相手サーバーなし：誰の本数にも入れない
    reception('ace', 'b9', 'r7'), // 部員と結ばれていない
    reception('B', 'b8', 'r8'),
  ]

  it('部員ごとの本数を、自チームのサーブと同じ式で出す', () => {
    const serves = bTeamServes(receptions, members)
    expect(serves.map((s) => s.serverId)).toEqual(['p7', 'p7', 'p7', 'p7', 'p7', 'p8'])
    const p7 = serveStatsOf(serves.filter((s) => s.serverId === 'p7'))
    expect(p7).toMatchObject({ attempts: 5, aces: 1, effects: 2, misses: 1 })
    expect(p7.efficiency).toBe(25)
  })
})

describe('bTeamReceptions（Aのサーブから。受けた相手が入っていて A〜D の本数だけ）', () => {
  // 部員 p7 が受けた：A2・B1・C1 の 4 本 →（100 × 2 ＋ 50 × 1）÷ 4 = 62.5%
  const serves = [
    serve({ receiverId: 'b7', reception: 'A', clientId: 'a1' }),
    serve({ receiverId: 'b7', reception: 'A', clientId: 'a2' }),
    serve({ receiverId: 'b7', reception: 'B', clientId: 'a3' }),
    serve({ receiverId: 'b7', reception: 'C', clientId: 'a4' }),
    serve({ receiverId: 'b7', result: 'ace', reception: null, clientId: 'a5' }), // エース：受けた相手は記録されない
    serve({ receiverId: 'b7', result: 'miss', reception: null, clientId: 'a6' }),
    serve({ receiverId: null, reception: 'A', clientId: 'a7' }), // 受けた相手なし
    serve({ receiverId: 'b9', reception: 'A', clientId: 'a8' }), // 部員と結ばれていない
    serve({ receiverId: 'b7', reception: null, clientId: 'a9' }), // 評価が未入力
  ]

  it('部員ごとの受数と成功率を、自チームのレシーブと同じ式で出す', () => {
    const recs = bTeamReceptions(serves, members)
    expect(recs).toHaveLength(4)
    expect(recs.every((r) => r.receiverId === 'p7')).toBe(true)
    const stats = receptionStatsOfResults(recs.map((r) => r.result))
    expect(stats.receptions).toBe(4)
    expect(stats.successRate).toBe(62.5)
    expect(stats.acedRate).toBe(0) // 被エースは受けた相手が記録されないので、個人には入らない
  })
})

describe('bTeamAttacks（相手のスパイクから。打った相手選手が部員と結ばれている記録だけ）', () => {
  // 部員 p7 のアタック：拾えず2（決定）・A1・B1（継続）・相手ミス1 の 5 本 → 決定率 2 ÷ 5 × 100 = 40%
  const records = [
    opp('killed', 'b7'),
    opp('killed', 'b7'),
    opp('A', 'b7'),
    opp('B', 'b7'),
    opp('opp_error', 'b7'),
    opp('killed', null),
    opp('killed', 'b9'),
  ]

  it('部員ごとの打数と決定率を、自チームのアタックと同じ式で出す', () => {
    const attacks = bTeamAttacks(records, members)
    expect(attacks).toHaveLength(5)
    expect(attacks.every((a) => a.attackerId === 'p7')).toBe(true)
    const stats = attackStatsOf(attacks)
    expect(stats.attempts).toBe(5)
    expect(stats.kills).toBe(2)
    expect(stats.killRate).toBe(40)
  })
})
