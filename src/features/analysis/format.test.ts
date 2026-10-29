import { describe, expect, it } from 'vitest'
import { formatPercent, formatRate, formatZoneCell, isReference } from './format.ts'

describe('formatPercent', () => {
  it('小数第1位までの % で出す', () => {
    expect(formatPercent(34)).toBe('34.0%')
    expect(formatPercent(11.9047)).toBe('11.9%')
    expect(formatPercent(100)).toBe('100.0%')
  })
  it('マイナスは「−」で出す', () => {
    expect(formatPercent(-5)).toBe('−5.0%')
    expect(formatPercent(-7.142857)).toBe('−7.1%')
  })
  it('丸めて 0.0 になる負の値には「−」を付けない', () => {
    expect(formatPercent(-0.04)).toBe('0.0%')
    expect(formatPercent(0)).toBe('0.0%')
  })
  it('打数 0（null）は「−」', () => {
    expect(formatPercent(null)).toBe('−')
  })
})

describe('参考値', () => {
  it('10 本未満が参考値', () => {
    expect(isReference(9)).toBe(true)
    expect(isReference(10)).toBe(false)
  })
  it('参考値には「*」を付ける。値がないときは付けない', () => {
    expect(formatRate(50, 9)).toBe('50.0%*')
    expect(formatRate(50, 10)).toBe('50.0%')
    expect(formatRate(null, 0)).toBe('−')
  })
  it('ヒートマップのゾーン内は値と本数を並べる', () => {
    expect(formatZoneCell(48, 21)).toBe('48.0%（21）')
    expect(formatZoneCell(48, 8)).toBe('48.0%*（8）')
    expect(formatZoneCell(null, 0)).toBe('−（0）')
  })
})
