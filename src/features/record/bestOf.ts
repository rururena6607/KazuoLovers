// 何セットマッチか（3 か 5）。最終セットの点数（FINAL_SET_POINTS）と、試合が終わったかを決めるのに使う。
// セットは「次のセットへ」で1つずつ作るので、作ったセットの数からは決められない。
// 試合（Match）にまだこの項目がないので、端末に試合ごとに保つ（#36 のレビューで、Match に足す案を出している）。

export type BestOf = 3 | 5

/** 高校の大会は3セットマッチが多い */
export const DEFAULT_BEST_OF: BestOf = 3

const key = (matchId: string) => `kazuolovers.bestOf.${matchId}`

export interface KeyValue {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** localStorage が使えない環境（プライベートブラウズなど）でも落ちないようにする */
const browser = (): KeyValue | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadBestOf(matchId: string, storage: KeyValue | null = browser()): BestOf {
  try {
    return storage?.getItem(key(matchId)) === '5' ? 5 : DEFAULT_BEST_OF
  } catch {
    return DEFAULT_BEST_OF
  }
}

export function saveBestOf(matchId: string, bestOf: BestOf, storage: KeyValue | null = browser()): void {
  try {
    storage?.setItem(key(matchId), String(bestOf))
  } catch {
    // 保てなくても、この画面を開いているあいだは使える
  }
}
