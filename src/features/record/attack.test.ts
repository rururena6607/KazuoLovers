import { describe, expect, it } from 'vitest'
import type { AttackRecord, ReceptionRecord, ServeRecord } from '../../contracts/index.ts'
import { buildAttack, emptyAttackDraft, prevReceptionOf, type AttackDraft } from './attack.ts'

const ids = { clientId: 'a1', setId: 's1', recordedAt: '2026-10-29T10:00:05.000Z' }
const t = (s: number) => `2026-10-29T10:00:${String(s).padStart(2, '0')}.000Z`

const reception = (result: ReceptionRecord['result'], s: number): ReceptionRecord => ({
  kind: 'reception',
  clientId: `r${s}`,
  setId: 's1',
  receiverId: 'p12',
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result,
  recordedAt: t(s),
})

const serveIn = (s: number): ServeRecord => ({
  kind: 'serve',
  clientId: `s${s}`,
  setId: 's1',
  serverId: 'p7',
  serveType: 'jump',
  fromX: null,
  toX: null,
  toY: null,
  result: 'in',
  missType: null,
  reception: 'B',
  receiverId: null,
  targetZone: null,
  recordedAt: t(s),
})

describe('prevReceptionOf', () => {
  it('直前が自チームの A〜D のレシーブなら、その評価', () => {
    expect(prevReceptionOf([reception('B', 1)])).toBe('B')
  })
  it('自チームのサーブのあと（相手の攻撃からの切り返し）は null', () => {
    expect(prevReceptionOf([serveIn(1)])).toBeNull()
  })
  it('アタックの継続のあとは null', () => {
    const cont: AttackRecord = {
      kind: 'attack',
      clientId: 'a0',
      setId: 's1',
      attackerId: 'p7',
      attackType: null,
      isBack: false,
      toX: null,
      toY: null,
      result: 'continue',
      prevReception: 'B',
      recordedAt: t(2),
    }
    expect(prevReceptionOf([reception('B', 1), cont])).toBeNull()
  })
})

describe('buildAttack', () => {
  const draft: AttackDraft = { attackerId: 'p7', attackType: 'left', isBack: false, to: { x: 0.3, y: 0.6 } }

  it('打った選手がいなければ作らない', () => {
    expect(buildAttack(emptyAttackDraft(), 'kill', null, ids)).toBeNull()
  })
  it('結果・方向・前のレシーブの評価を残す', () => {
    expect(buildAttack(draft, 'kill', 'A', ids)).toMatchObject({
      attackerId: 'p7',
      attackType: 'left',
      isBack: false,
      toX: 0.3,
      toY: 0.6,
      result: 'kill',
      prevReception: 'A',
    })
  })
  it('種類が「バック」ならバックアタックにする', () => {
    expect(buildAttack({ ...draft, attackType: 'back' }, 'error', null, ids)?.isBack).toBe(true)
  })
})
