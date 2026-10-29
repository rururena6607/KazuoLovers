import { describe, expect, it } from 'vitest'
import { buildServe, emptyDraft, nextDraft, type ServeDraft } from './serve.ts'

const ids = { clientId: 'c1', setId: 's1', recordedAt: '2026-10-29T10:00:00.000Z' }
const draft: ServeDraft = {
  serverId: 'p7',
  serveType: 'jump',
  fromX: 0.8,
  to: { x: 0.2, y: 0.9 },
  receiverId: 'o12',
}

describe('buildServe', () => {
  it('サーバーがいなければ作らない', () => {
    expect(buildServe(emptyDraft(), { result: 'ace' }, ids)).toBeNull()
  })

  it('A〜D はインとして、評価と受けた相手を残す', () => {
    const rec = buildServe(draft, { result: 'in', grade: 'C' }, ids)
    expect(rec).toMatchObject({ result: 'in', reception: 'C', receiverId: 'o12', toX: 0.2, toY: 0.9 })
  })

  it('エースは評価も受けた相手もなし', () => {
    const rec = buildServe(draft, { result: 'ace' }, ids)
    expect(rec).toMatchObject({ result: 'ace', reception: null, receiverId: null, missType: null })
  })

  it('ネットのミスは着弾点なし、アウトは残す', () => {
    expect(buildServe(draft, { result: 'miss', missType: 'net' }, ids)).toMatchObject({
      toX: null,
      toY: null,
      missType: 'net',
    })
    expect(buildServe(draft, { result: 'miss', missType: 'out' }, ids)).toMatchObject({ toX: 0.2 })
  })
})

describe('nextDraft', () => {
  it('サーバー・種類・打つ位置を残し、着弾点と受けた相手を空にする', () => {
    expect(nextDraft(draft)).toEqual({ ...draft, to: null, receiverId: null })
  })
})
