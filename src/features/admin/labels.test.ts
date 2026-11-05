import { describe, expect, it } from 'vitest'
import { MATCH_KIND_LABELS, matchLabel, today } from './labels.ts'

describe('today', () => {
  it('端末の日付を YYYY-MM-DD で返す（UTC ではない）', () => {
    // 日本の朝7時は UTC では前の日の22時
    expect(today(new Date(2026, 9, 29, 7, 0))).toBe('2026-10-29')
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('matchLabel', () => {
  const opponents = [{ id: 'o1', teamId: 't', name: '熊本工業' }]

  it('試合は相手チーム名、練習と紅白戦はその種類を出す', () => {
    expect(matchLabel({ kind: 'match', opponentId: 'o1' }, opponents)).toBe('熊本工業')
    expect(matchLabel({ kind: 'practice', opponentId: null }, opponents)).toBe('練習')
    // 紅白戦の B チームは相手チームの一覧にいないので、種類の名前を出す
    expect(matchLabel({ kind: 'scrimmage', opponentId: 'o-b' }, opponents)).toBe('紅白戦')
  })

  it('相手が見つからない試合は「（相手なし）」', () => {
    expect(matchLabel({ kind: 'match', opponentId: 'gone' }, opponents)).toBe('（相手なし）')
  })

  it('3 種類すべてに名前がある', () => {
    expect(Object.keys(MATCH_KIND_LABELS).sort()).toEqual(['match', 'practice', 'scrimmage'])
  })
})
