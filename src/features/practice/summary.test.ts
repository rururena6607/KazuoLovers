import { describe, expect, it } from 'vitest'
import type { ServeRecord } from '../../contracts/index.ts'
import { practiceSummary } from './summary.ts'

// 相手コートの奥の左（x 0.1, y 0.9）はゾーン 1、ネット側の中央（x 0.5, y 0.1）はゾーン 3
const practice = (result: 'in' | 'miss', to: [number, number] | null, targetZone = 1): ServeRecord => ({
  kind: 'serve',
  clientId: crypto.randomUUID(),
  setId: 'practice',
  serverId: 'p7',
  serveType: 'float',
  fromX: null,
  toX: to?.[0] ?? null,
  toY: to?.[1] ?? null,
  result,
  missType: null,
  reception: null,
  receiverId: null,
  targetZone,
  recordedAt: '2026-10-29T10:00:00.000Z',
})

describe('practiceSummary', () => {
  it('本数が 0 なら率は null', () => {
    expect(practiceSummary([])).toEqual({
      total: 0,
      inCount: 0,
      zoneHits: 0,
      successRate: null,
      zoneHitRate: null,
    })
  })

  it('4本：狙い通り1・入ったが外れ2・ミス1 → 成功率 75%、的中率 25%', () => {
    const s = practiceSummary([
      practice('in', [0.1, 0.9]),
      practice('in', [0.5, 0.1]),
      practice('in', [0.5, 0.1]),
      practice('miss', [1.1, 0.5]),
    ])
    expect(s).toEqual({ total: 4, inCount: 3, zoneHits: 1, successRate: 75, zoneHitRate: 25 })
  })

  it('ミスはゾーンに入っていても的中にしない', () => {
    expect(practiceSummary([practice('miss', [0.1, 0.9])]).zoneHits).toBe(0)
  })
})
