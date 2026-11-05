// 選手ごとの色（F-22）。記録画面の着弾点と、分析画面の散布図（とりはる、T-26）で同じ色を使う。
// ゾーンの色（赤・橙・黄・緑・青・紫、薄く塗る）と見分けられるよう、濃い色にして白い背番号を書く。
// 色だけに頼らず、点の中には必ず背番号を書く（F-22）。
import type { Player } from '../contracts/index.ts'

/** 濃い色を12色。チームの選手が12人を超えたら、最初の色からくり返す（背番号で見分ける） */
export const PLAYER_COLORS: readonly string[] = [
  '#1e3a8a', // 紺
  '#0f766e', // 青緑
  '#be185d', // 赤紫
  '#78350f', // 茶
  '#3f6212', // 深緑
  '#334155', // 灰
  '#9f1239', // えんじ
  '#155e75', // 藍
  '#854d0e', // 黄土
  '#4338ca', // 藍紫
  '#166534', // 緑
  '#581c87', // 濃い紫
]

/**
 * 選手 id → 色。背番号の順に色を割り当てるので、同じチームならどの画面でも同じ色になる。
 * 引退した選手も含めて渡す（過去の記録の色が変わらないように）
 */
export function playerColorMap(players: readonly Player[]): ReadonlyMap<string, string> {
  const sorted = [...players].sort((a, b) => a.number - b.number || a.id.localeCompare(b.id))
  return new Map(sorted.map((p, i) => [p.id, PLAYER_COLORS[i % PLAYER_COLORS.length] ?? 'var(--ink)']))
}
