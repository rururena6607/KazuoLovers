// 分析画面に出す内容を作る（純粋な関数）。画面のコンポーネントは、ここで作った表示用の値を並べるだけにする。
// 指標と集計は lib/stats、ゾーンは lib/court を使い、式はここに持たない。
import type {
  AttackStats,
  GameSet,
  Match,
  Opponent,
  Player,
  ReceptionStats,
  ServeStats,
  ServeType,
  SetRecords,
} from '../../contracts/index.ts'
import { zoneOf } from '../../lib/court/index.ts'
import {
  attackStatsByPlayer,
  attackStatsOf,
  practiceStatsByPlayer,
  practiceStatsByTargetZone,
  practiceStatsOf,
  receptionStatsByPlayer,
  receptionStatsByZone,
  receptionStatsOf,
  serveStatsByLandingZone,
  serveStatsByPlayer,
  serveStatsByType,
  serveStatsOf,
  type PracticeStats,
} from '../../lib/stats/index.ts'
import { formatRate, formatZoneCell, isNegativeShown, isReference } from './format.ts'

export interface AnalysisData {
  players: readonly Player[]
  opponents: readonly Opponent[]
  matches: readonly Match[]
  gameSets: readonly GameSet[]
  records: readonly SetRecords[]
}

/**
 * 範囲の選択。all は試合（kind = match）すべて、practice は練習（kind = practice）すべて。
 * 練習は公式の指標と物差しが違うので、全体には混ぜない。
 */
export type Scope =
  | { kind: 'all' }
  | { kind: 'practice' }
  | { kind: 'match'; matchId: string }
  | { kind: 'set'; setId: string }
  | { kind: 'opponent'; opponentId: string }

export type Tab = 'serve' | 'reception' | 'attack'

export const TAB_LABELS: Record<Tab, string> = {
  serve: 'サーブ',
  reception: 'レシーブ',
  attack: 'アタック',
}

export const SERVE_TYPE_LABELS: Record<ServeType, string> = {
  float: 'フローター',
  jump_float: 'ジャンプフローター',
  jump: 'ジャンプサーブ',
  other: 'その他',
}

/** 範囲に入るセットの記録 */
export function recordsInScope(scope: Scope, data: AnalysisData): SetRecords[] {
  const matchOfSet = new Map<string, Match>()
  const matchById = new Map(data.matches.map((m) => [m.id, m]))
  for (const gs of data.gameSets) {
    const match = matchById.get(gs.matchId)
    if (match) matchOfSet.set(gs.id, match)
  }
  const inScope = (setId: string): boolean => {
    const match = matchOfSet.get(setId)
    if (!match) return false
    switch (scope.kind) {
      case 'all':
        return match.kind === 'match'
      case 'practice':
        return match.kind === 'practice'
      case 'match':
        return match.id === scope.matchId
      case 'set':
        return setId === scope.setId
      case 'opponent':
        return match.kind === 'match' && match.opponentId === scope.opponentId
    }
  }
  return data.records.filter((r) => inScope(r.setId))
}

// ---- 表示用の値 ----

/** 率の1マス。reference は本数が少ない参考値、negative は「−」を付けて出すマイナス */
export interface Cell {
  text: string
  reference: boolean
  negative: boolean
}

export const countCell = (n: number): Cell => ({ text: String(n), reference: false, negative: false })

export const rateCell = (value: number | null, count: number): Cell => ({
  text: formatRate(value, count),
  reference: value !== null && isReference(count),
  negative: isNegativeShown(value),
})

/** セルの CSS クラス（参考値は薄く、マイナスは色を変える） */
export const cellClass = (c: Cell): string =>
  ['an-num', c.reference && 'an-ref', c.negative && 'an-neg'].filter(Boolean).join(' ')

export interface Metric {
  label: string
  cell: Cell
}

export interface TableRow {
  /** React の key。選手の id やサーブの種類（表示名は重なることがある） */
  id: string
  label: string
  cells: Cell[]
}

export interface Table {
  /** 先頭の列（名前）の見出しは含めない */
  columns: string[]
  rows: TableRow[]
}

interface Cells {
  columns: string[]
  cells: Cell[]
}

const SERVE_COLUMNS = ['打数', 'サーブ効果率', 'エース率', 'ミス率']
const RECEPTION_COLUMNS = ['受数', 'サーブレシーブ成功率', '被エース率']
const ATTACK_COLUMNS = ['打数', 'アタック決定率', '効果率', '失点']
const PRACTICE_COLUMNS = ['本数', '成功率', 'ゾーン的中率']

const serveCells = (s: ServeStats): Cells => ({
  columns: SERVE_COLUMNS,
  cells: [
    countCell(s.attempts),
    rateCell(s.efficiency, s.attempts),
    rateCell(s.aceRate, s.attempts),
    rateCell(s.missRate, s.attempts),
  ],
})

const receptionCells = (s: ReceptionStats): Cells => ({
  columns: RECEPTION_COLUMNS,
  cells: [countCell(s.receptions), rateCell(s.successRate, s.receptions), rateCell(s.acedRate, s.receptions)],
})

const attackCells = (s: AttackStats): Cells => ({
  columns: ATTACK_COLUMNS,
  cells: [
    countCell(s.attempts),
    rateCell(s.killRate, s.attempts),
    rateCell(s.efficiency, s.attempts),
    countCell(s.errors),
  ],
})

const practiceCells = (s: PracticeStats): Cells => ({
  columns: PRACTICE_COLUMNS,
  cells: [countCell(s.attempts), rateCell(s.successRate, s.attempts), rateCell(s.zoneHitRate, s.attempts)],
})

const flat = {
  serves: (sets: readonly SetRecords[]) => sets.flatMap((s) => s.serves),
  receptions: (sets: readonly SetRecords[]) => sets.flatMap((s) => s.receptions),
  attacks: (sets: readonly SetRecords[]) => sets.flatMap((s) => s.attacks),
}

function overallCells(tab: Tab, sets: readonly SetRecords[]): Cells {
  switch (tab) {
    case 'serve':
      return serveCells(serveStatsOf(flat.serves(sets)))
    case 'reception':
      return receptionCells(receptionStatsOf(flat.receptions(sets)))
    case 'attack':
      return attackCells(attackStatsOf(flat.attacks(sets)))
  }
}

const toMetrics = ({ columns, cells }: Cells): Metric[] =>
  columns.map((label, i) => ({ label, cell: cells[i] ?? countCell(0) }))

/** 全体指標。サーブ：打数・サーブ効果率・エース率・ミス率／レシーブ：受数・成功率・被エース率／アタック：打数・決定率・効果率・失点 */
export const overallMetrics = (tab: Tab, sets: readonly SetRecords[]): Metric[] =>
  toMetrics(overallCells(tab, sets))

/** 「7 渡辺」のように背番号と名前を並べる。選手が見つからないときは「?」 */
export const playerLabel = (p: Player | undefined): string => (p ? `${p.number} ${p.name}` : '?')

/** 背番号順に並べる比較関数。名簿にない選手は最後 */
const byNumber = (players: readonly Player[]) => {
  const number = new Map(players.map((p) => [p.id, p.number]))
  return (a: string, b: string): number => (number.get(a) ?? Infinity) - (number.get(b) ?? Infinity)
}

function playerRows<S>(
  stats: Map<string, S>,
  cellsOf: (s: S) => Cells,
  players: readonly Player[],
): TableRow[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  return [...stats.keys()]
    .sort(byNumber(players))
    .flatMap((id) => {
      const s = stats.get(id)
      return s === undefined ? [] : [{ id, label: playerLabel(byId.get(id)), cells: cellsOf(s).cells }]
    })
}

/** 選手別表。背番号順 */
export function playerTable(tab: Tab, sets: readonly SetRecords[], players: readonly Player[]): Table {
  const columns = overallCells(tab, []).columns
  switch (tab) {
    case 'serve':
      return { columns, rows: playerRows(serveStatsByPlayer(flat.serves(sets)), serveCells, players) }
    case 'reception':
      return {
        columns,
        rows: playerRows(receptionStatsByPlayer(flat.receptions(sets)), receptionCells, players),
      }
    case 'attack':
      return { columns, rows: playerRows(attackStatsByPlayer(flat.attacks(sets)), attackCells, players) }
  }
}

/** サーブの種類別の表（記録のある種類だけ。並びは lib/stats の決まった順） */
export function serveTypeTable(sets: readonly SetRecords[]): Table {
  return {
    columns: SERVE_COLUMNS,
    rows: [...serveStatsByType(flat.serves(sets))].map(([type, s]) => ({
      id: type,
      label: SERVE_TYPE_LABELS[type],
      cells: serveCells(s).cells,
    })),
  }
}

// ---- ヒートマップ ----

export interface HeatCell {
  zone: number
  text: string
  count: number
  reference: boolean
  /** マイナスの値。色を変える（本数がない・値がないゾーンとは区別する） */
  negative: boolean
  /** 色の濃さ 0〜1。表示中の値の絶対値の最大を 1 にそろえる。値がないときは 0 */
  intensity: number
}

export interface Heatmap {
  /** 相手コートか自コートか。ゾーンの並びが変わる */
  side: 'opponent' | 'own'
  /** 値の名前。例：サーブ効果率 */
  metric: string
  cells: HeatCell[]
}

interface ZoneValue {
  zone: number
  value: number | null
  count: number
}

/** 値は表示中のゾーンどうしで比べるので、色の濃さは絶対値の最大でそろえる（効果率は 10〜30% 程度に集まる） */
function makeHeatmap(side: Heatmap['side'], metric: string, values: ZoneValue[]): Heatmap {
  const max = Math.max(0, ...values.map((v) => Math.abs(v.value ?? 0)))
  return {
    side,
    metric,
    cells: values.map(({ zone, value, count }) => ({
      zone,
      text: formatZoneCell(value, count),
      count,
      reference: value !== null && isReference(count),
      negative: isNegativeShown(value),
      intensity: value === null || max === 0 ? 0 : Math.abs(value) / max,
    })),
  }
}

/**
 * サーブ：相手コートの着弾ゾーン別のサーブ効果率。レシーブ：自コートの受けた位置別のサーブレシーブ成功率。
 * アタックのヒートマップはない（着弾点は任意項目で、F-11 にも求められていない）。
 * 6 ゾーンすべてを返す（lib/stats が 0 本のゾーンも入れる）
 */
export function heatmap(tab: 'serve' | 'reception', sets: readonly SetRecords[]): Heatmap {
  if (tab === 'serve') {
    const by = serveStatsByLandingZone(flat.serves(sets), zoneOf)
    return makeHeatmap(
      'opponent',
      'サーブ効果率',
      [...by].map(([zone, s]) => ({ zone, value: s.efficiency, count: s.attempts })),
    )
  }
  const by = receptionStatsByZone(flat.receptions(sets), zoneOf)
  return makeHeatmap(
    'own',
    'サーブレシーブ成功率',
    [...by].map(([zone, s]) => ({ zone, value: s.successRate, count: s.receptions })),
  )
}

// ---- 練習 ----

export interface PracticeView {
  metrics: Metric[]
  table: Table
  /** 狙ったゾーン別のゾーン的中率 */
  heatmap: Heatmap
}

export function practiceView(sets: readonly SetRecords[], players: readonly Player[]): PracticeView {
  const serves = flat.serves(sets)
  return {
    metrics: toMetrics(practiceCells(practiceStatsOf(serves, zoneOf))),
    table: {
      columns: PRACTICE_COLUMNS,
      rows: playerRows(practiceStatsByPlayer(serves, zoneOf), practiceCells, players),
    },
    heatmap: makeHeatmap(
      'opponent',
      'ゾーン的中率',
      [...practiceStatsByTargetZone(serves, zoneOf)].map(([zone, s]) => ({
        zone,
        value: s.zoneHitRate,
        count: s.attempts,
      })),
    ),
  }
}

// ---- 範囲の選択肢 ----

export interface ScopeOption {
  value: string
  label: string
}

/** 試合・セット・相手の選択肢（練習は含めない）。試合は日付順、セットは試合の日付順にセット番号順 */
export function scopeOptions(kind: 'match' | 'set' | 'opponent', data: AnalysisData): ScopeOption[] {
  const matches = data.matches.filter((m) => m.kind === 'match').sort((a, b) => a.date.localeCompare(b.date))
  const opponentName = (id: string | null) => data.opponents.find((o) => o.id === id)?.name ?? '相手未設定'
  const matchLabel = (m: Match) => `${m.date} ${opponentName(m.opponentId)}`
  switch (kind) {
    case 'match':
      return matches.map((m) => ({ value: m.id, label: matchLabel(m) }))
    case 'opponent':
      return data.opponents
        .filter((o) => matches.some((m) => m.opponentId === o.id))
        .map((o) => ({ value: o.id, label: o.name }))
    case 'set':
      return matches.flatMap((m) =>
        data.gameSets
          .filter((gs) => gs.matchId === m.id)
          .sort((a, b) => a.setNo - b.setNo)
          .map((gs) => ({ value: gs.id, label: `${matchLabel(m)} 第${gs.setNo}セット` })),
      )
  }
}
