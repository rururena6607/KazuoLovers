import { describe, expect, it } from 'vitest'
import { today } from './labels.ts'

describe('today', () => {
  it('端末の日付を YYYY-MM-DD で返す（UTC ではない）', () => {
    // 日本の朝7時は UTC では前の日の22時
    expect(today(new Date(2026, 9, 29, 7, 0))).toBe('2026-10-29')
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
