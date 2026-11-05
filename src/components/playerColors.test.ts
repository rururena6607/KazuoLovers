import { describe, expect, it } from 'vitest'
import type { Player } from '../contracts/index.ts'
import { PLAYER_COLORS, playerColorMap } from './playerColors.ts'

const player = (id: string, number: number, active = true): Player => ({
  id,
  teamId: 't',
  number,
  name: id,
  position: null,
  serveType: 'float',
  active,
})

describe('playerColorMap', () => {
  it('背番号の順に色を割り当て、渡す順番が違っても同じ色になる', () => {
    const a = playerColorMap([player('p7', 7), player('p1', 1), player('p3', 3)])
    const b = playerColorMap([player('p3', 3), player('p7', 7), player('p1', 1)])
    expect(a.get('p1')).toBe(PLAYER_COLORS[0])
    expect(a.get('p3')).toBe(PLAYER_COLORS[1])
    expect(a.get('p7')).toBe(PLAYER_COLORS[2])
    expect([...a]).toEqual([...b])
  })
  it('選手が色の数より多ければ、最初の色からくり返す', () => {
    const many = Array.from({ length: PLAYER_COLORS.length + 1 }, (_, i) => player(`p${i}`, i + 1))
    const m = playerColorMap(many)
    expect(m.get(`p${PLAYER_COLORS.length}`)).toBe(PLAYER_COLORS[0])
  })
  it('色はどれも違う', () => {
    expect(new Set(PLAYER_COLORS).size).toBe(PLAYER_COLORS.length)
  })
})
