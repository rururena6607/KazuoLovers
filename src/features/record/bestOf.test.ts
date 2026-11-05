import { describe, expect, it } from 'vitest'
import { DEFAULT_BEST_OF, loadBestOf, saveBestOf, type KeyValue } from './bestOf.ts'

const memory = (): KeyValue => {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

describe('bestOf', () => {
  it('保っていなければ3セットマッチ', () => {
    expect(DEFAULT_BEST_OF).toBe(3)
    expect(loadBestOf('m1', memory())).toBe(3)
    expect(loadBestOf('m1', null)).toBe(3)
  })
  it('試合ごとに保つ', () => {
    const s = memory()
    saveBestOf('m1', 5, s)
    expect(loadBestOf('m1', s)).toBe(5)
    expect(loadBestOf('m2', s)).toBe(3)
  })
  it('localStorage が例外を投げても落ちない', () => {
    const broken: KeyValue = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadBestOf('m1', broken)).toBe(3)
    expect(() => saveBestOf('m1', 5, broken)).not.toThrow()
  })
})
