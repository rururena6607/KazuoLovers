import { describe, expect, it } from 'vitest'
import { isIos } from './pwa.ts'

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
}

describe('isIos', () => {
  it('iPhone と iPad は true', () => {
    expect(isIos(UA.iphone)).toBe(true)
    expect(isIos(UA.ipad)).toBe(true)
  })
  it('Android と PC は false', () => {
    expect(isIos(UA.android)).toBe(false)
    expect(isIos(UA.windows)).toBe(false)
  })
})
