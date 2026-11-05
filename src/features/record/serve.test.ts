import { describe, expect, it } from 'vitest'
import { buildServe, emptyDraft, fitsOutcome, nextDraft, type ServeDraft } from './serve.ts'

const ids = { clientId: 'c1', setId: 's1', recordedAt: '2026-10-29T10:00:00.000Z' }
const draft: ServeDraft = {
  serverId: 'p7',
  serveType: 'jump',
  fromX: 0.8,
  to: { x: 0.2, y: 0.9 },
  receiverId: 'o12',
  speed: 'slow',
}

describe('buildServe', () => {
  it('サーバーがいなければ作らない', () => {
    expect(buildServe(emptyDraft(), { result: 'ace' }, ids)).toBeNull()
  })

  it('A〜D はインとして、評価と受けた相手を残す', () => {
    const rec = buildServe(draft, { result: 'in', grade: 'C' }, ids)
    expect(rec).toMatchObject({ result: 'in', reception: 'C', receiverId: 'o12', toX: 0.2, toY: 0.9 })
  })

  it('速さを残す。入れなければ null（F-26）', () => {
    expect(buildServe(draft, { result: 'ace' }, ids)?.speed).toBe('slow')
    expect(buildServe({ ...draft, speed: null }, { result: 'ace' }, ids)?.speed).toBeNull()
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
    const out = { ...draft, to: { x: 1.1, y: 0.5 } }
    expect(buildServe(out, { result: 'miss', missType: 'out' }, ids)).toMatchObject({ toX: 1.1 })
  })
})

describe('fitsOutcome', () => {
  const inside = { x: 0.5, y: 0.5 }
  const outside = { x: 1.1, y: 0.5 }
  const netSide = { x: 0.5, y: -0.05 }

  it('エース・A〜D はコートの中か着弾点なし', () => {
    expect(fitsOutcome(inside, { result: 'ace' })).toBe(true)
    expect(fitsOutcome(null, { result: 'in', grade: 'A' })).toBe(true)
    expect(fitsOutcome(outside, { result: 'ace' })).toBe(false)
    expect(fitsOutcome(outside, { result: 'in', grade: 'A' })).toBe(false)
  })

  it('アウトはコートの外か着弾点なし', () => {
    expect(fitsOutcome(outside, { result: 'miss', missType: 'out' })).toBe(true)
    expect(fitsOutcome(inside, { result: 'miss', missType: 'out' })).toBe(false)
  })

  it('ネットより手前の点はネットのミスにしか使えない', () => {
    expect(fitsOutcome(netSide, { result: 'in', grade: 'B' })).toBe(false)
    expect(fitsOutcome(netSide, { result: 'miss', missType: 'out' })).toBe(false)
    expect(fitsOutcome(netSide, { result: 'miss', missType: 'net' })).toBe(true)
  })

  it('食い違うときは buildServe も作らない', () => {
    expect(buildServe({ ...draft, to: outside }, { result: 'in', grade: 'A' }, ids)).toBeNull()
  })
})

describe('nextDraft', () => {
  it('サーバー・種類・打つ位置を残し、着弾点・受けた相手・速さを空にする', () => {
    expect(nextDraft(draft)).toEqual({ ...draft, to: null, receiverId: null, speed: null })
  })
})
