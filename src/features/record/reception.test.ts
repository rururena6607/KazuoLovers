import { describe, expect, it } from 'vitest'
import {
  attachToReception,
  buildReception,
  emptyReceptionDraft,
  type ReceptionDraft,
} from './reception.ts'

const ids = { clientId: 'c1', setId: 's1', recordedAt: '2026-10-29T10:00:00.000Z' }
const draft: ReceptionDraft = {
  receiverId: 'p12',
  at: { x: 0.5, y: 0.8 },
  oppServerId: 'o9',
  oppServeType: 'jump_float',
}

describe('buildReception', () => {
  it('A〜D は受けた選手がいないと作らない', () => {
    expect(buildReception(emptyReceptionDraft(), 'A', ids)).toBeNull()
  })

  it('被エースも受けた選手が要る（テーブルの制約）', () => {
    expect(buildReception(emptyReceptionDraft(), 'ace', ids)).toBeNull()
    expect(buildReception(draft, 'ace', ids)).toMatchObject({ result: 'ace', receiverId: 'p12' })
  })

  it('A〜D は受けた選手・位置・相手サーバーを残す', () => {
    expect(buildReception(draft, 'B', ids)).toMatchObject({
      result: 'B',
      receiverId: 'p12',
      atX: 0.5,
      atY: 0.8,
      oppServerId: 'o9',
      oppServeType: 'jump_float',
    })
  })

  it('相手ミスは受けた選手も位置もなし。相手サーバーは残す', () => {
    expect(buildReception(draft, 'opp_miss', ids)).toMatchObject({
      result: 'opp_miss',
      receiverId: null,
      atX: null,
      oppServerId: 'o9',
    })
  })
})

describe('attachToReception', () => {
  it('結果のあとに受けた位置と相手サーバーを付け足せる', () => {
    const rec = buildReception({ ...draft, at: null, oppServerId: null }, 'C', ids)
    if (!rec) throw new Error('作れない')
    const next = attachToReception(rec, { at: { x: 0.1, y: 0.2 }, oppServerId: 'o3' })
    expect(next).toMatchObject({ atX: 0.1, atY: 0.2, oppServerId: 'o3', result: 'C' })
  })
})
