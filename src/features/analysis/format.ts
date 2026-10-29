// 数値の表示（要件定義書 6 章「数値の表示」）。丸めは画面に出すときだけ行う。
import { MIN_SAMPLE } from '../../contracts/index.ts'

/** 率がないとき（打数 0）の表示 */
export const NO_VALUE = '−'

/** 画面で「−」を付けて出す値か（丸めて 0.0 になる負の値には付けない）。色を変える判定にも使う */
export const isNegativeShown = (value: number | null): boolean =>
  value !== null && value < 0 && Math.abs(value).toFixed(1) !== '0.0'

/** 小数第1位までの %。マイナスは「−」（U+2212）。打数 0 の null は「−」 */
export function formatPercent(value: number | null): string {
  if (value === null) return NO_VALUE
  const text = Math.abs(value).toFixed(1)
  return isNegativeShown(value) ? `−${text}%` : `${text}%`
}

/** 本数が少ない値は「参考値」。MIN_SAMPLE 本未満 */
export const isReference = (count: number): boolean => count < MIN_SAMPLE

/** 参考値には「*」を付ける */
export function formatRate(value: number | null, count: number): string {
  const text = formatPercent(value)
  return value !== null && isReference(count) ? `${text}*` : text
}

/** ヒートマップのゾーン内の表示。例：`48.0%（21）` */
export const formatZoneCell = (value: number | null, count: number): string =>
  `${formatRate(value, count)}（${count}）`
