// 値を変えるのは、その値を使う範囲の所有者の PR だけ（実装計画書 4 節）。

/** これより少ない本数の値は「参考値」として表示する（要件定義書 F-11） */
export const MIN_SAMPLE = 10

/** 1セットの点数の初期値と、最終セットの点数 */
export const DEFAULT_SET_POINTS = 25
export const FINAL_SET_POINTS = 15

/** セットの終わりに必要な点差 */
export const SET_WIN_MARGIN = 2

/** 前衛と後衛の境目（アタックライン）。コートの奥行き 9m のうちネットから 3m */
export const ATTACK_LINE_Y = 1 / 3

/**
 * ゾーン番号の並び（要件定義書 6 章）。記録する側から見て、左から右へ。
 * 相手コート：ネット側（前衛）が 2・3・4、奥（後衛）が 1・6・5
 * 自コート：ネット側（前衛）が 4・3・2、奥（後衛）が 5・6・1
 */
export const ZONES = {
  opponent: { front: [2, 3, 4], back: [1, 6, 5] },
  own: { front: [4, 3, 2], back: [5, 6, 1] },
} as const
