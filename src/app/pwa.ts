// PWA の案内で使う、端末の判定（要件定義書 10 章「iPhone対応」）。

/**
 * iPhone・iPad・iPod の Safari か。userAgent（ブラウザが名乗る文字列）で判定する。
 * 例：'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ...'
 */
export function isIos(userAgent: string): boolean {
  return userAgent.includes('iPhone') || userAgent.includes('iPod') || userAgent.includes('iPad')
}

/** ホーム画面から全画面で開いているか（すでにインストール済みなら案内を出さない） */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}
