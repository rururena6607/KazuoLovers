import { afterEach, describe, expect, it, vi } from 'vitest'
import { iosBrowserOf, isIos, readStorage, writeStorage } from './pwa.ts'

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadOld:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // iPadOS 13 以降の既定（デスクトップ用 Web サイト）。Mac と同じ形
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
}

describe('isIos', () => {
  it('iPhone と iPad は true', () => {
    expect(isIos(UA.iphone)).toBe(true)
    expect(isIos(UA.ipadOld)).toBe(true)
  })
  it('Mac を名乗る今の iPad は、タッチの点が 2 つ以上なら true', () => {
    expect(isIos(UA.ipad, 5)).toBe(true)
  })
  it('本物の Mac（タッチなし）は false', () => {
    expect(isIos(UA.ipad, 0)).toBe(false)
  })
  it('Android と PC は false', () => {
    expect(isIos(UA.android)).toBe(false)
    expect(isIos(UA.windows)).toBe(false)
  })
})

describe('iosBrowserOf', () => {
  it('Safari・ほかのブラウザ・アプリ内ブラウザを見分ける', () => {
    expect(iosBrowserOf(UA.iphone)).toBe('safari')
    expect(iosBrowserOf(UA.chromeIos)).toBe('other')
    expect(iosBrowserOf(UA.line)).toBe('inApp')
  })
})

describe('readStorage / writeStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('localStorage に触れると例外になる環境でも落ちない', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
    })
    expect(readStorage('k')).toBeNull()
    expect(writeStorage('k', '1')).toBe(false)
  })
})
