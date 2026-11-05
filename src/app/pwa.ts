// PWA の案内で使う、端末とブラウザの判定（要件定義書 10 章「iPhone対応」）。

/**
 * iPhone・iPad・iPod か。userAgent（ブラウザが名乗る文字列）で判定する。
 * 例：'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ...'
 * iPadOS 13 以降の Safari は Mac（'Macintosh'）を名乗るので、タッチの点の数で見分ける。
 */
export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPod|iPad/.test(userAgent)) return true
  return userAgent.includes('Macintosh') && maxTouchPoints > 1
}

/**
 * iOS のどのブラウザで開いているか。
 * - inApp：LINE などのアプリ内ブラウザ。「ホーム画面に追加」がない
 * - other：Chrome・Firefox・Edge。共有メニューから追加する（iOS 16.4 以降）
 * - safari：Safari
 */
export type IosBrowser = 'safari' | 'other' | 'inApp'

export function iosBrowserOf(userAgent: string): IosBrowser {
  if (/\bLine\/|FBAN|FBAV|Instagram/.test(userAgent)) return 'inApp'
  if (/CriOS|FxiOS|EdgiOS/.test(userAgent)) return 'other'
  return 'safari'
}

/** ホーム画面から全画面で開いているか（すでにインストール済みなら案内を出さない） */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

// Cookie をすべてブロックした Safari などでは、localStorage に触れただけで例外になる。
// 使えないときは「保存されていない」として扱う。

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 保存できたら true */
export function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
