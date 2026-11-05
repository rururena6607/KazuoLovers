import { describe, expect, it } from 'vitest'
import type { Match, OpponentPlayer } from '../contracts/index.ts'
import { DEMO_MATCH, DEMO_PLAYERS, DEMO_PRACTICE } from '../features/record/demo.ts'
import { loadDemoTeam, loadTeamFrom, scrimmageTeamIds } from './analysisData.ts'

const scrimmage = (id: string, opponentId: string): Match => ({
  ...DEMO_MATCH,
  id,
  kind: 'scrimmage',
  opponentId,
})

describe('scrimmageTeamIds', () => {
  it('紅白戦の B チームの id だけを、重ねずに返す（ふつうの試合・練習は入れない）', () => {
    const matches = [DEMO_MATCH, DEMO_PRACTICE, scrimmage('m1', 'b1'), scrimmage('m2', 'b2'), scrimmage('m3', 'b1')]
    expect(scrimmageTeamIds(matches)).toEqual(['b1', 'b2'])
  })
})

describe('loadTeamFrom（紅白戦の B チームの選手）', () => {
  const bPlayers: Record<string, OpponentPlayer[]> = {
    b1: [{ id: 'bp7', opponentId: 'b1', number: 7, playerId: 'p7' }],
  }
  const asked: string[] = []
  const data = {
    myTeam: () => Promise.resolve({ id: 't', name: 'チーム' }),
    listPlayers: () => Promise.resolve([...DEMO_PLAYERS]),
    listOpponents: () => Promise.resolve([]),
    listMatches: () => Promise.resolve([DEMO_MATCH, scrimmage('m1', 'b1')]),
    listSets: () => Promise.resolve([]),
    listOpponentPlayers: (id: string) => {
      asked.push(id)
      return Promise.resolve(bPlayers[id] ?? [])
    },
  }

  it('紅白戦の B チームの選手を opponentPlayers に入れる（ふつうの試合の相手は読まない）', async () => {
    const team = await loadTeamFrom(data)()
    expect(team?.opponentPlayers).toEqual(bPlayers.b1)
    expect(asked).toEqual(['b1'])
  })

  it('デモには紅白戦がないので空', async () => {
    expect((await loadDemoTeam())?.opponentPlayers).toEqual([])
  })
})
