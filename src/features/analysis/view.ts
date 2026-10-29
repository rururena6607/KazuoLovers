// 分析画面に出す内容を作る（純粋な関数）。画面のコンポーネントは、ここで作った表示用の値を並べるだけにする。
// 指標と集計は lib/stats、ゾーンは lib/court を使い、式はここに持たない。
import type {
  GameSet,
  Match,
  Opponent,
  Player,
  ServeType,
  SetRecords,
} from '../../contracts/index.ts'
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
import { formatPercent, formatRate, formatZoneCell, isReference } from './format.ts'

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

/** 率の1マス。reference は本数が少ない参考値、negative はマイナス */
export interface Cell {
  text: string
  reference: boolean
  negative: boolean
}

export const countCell = (n: number): Cell => ({ text: String(n), reference: false, negative: false })

export const rateCell = (value: number | null, count: number): Cell => ({
  text: formatRate(value, count),
  reference: value !== null && isReference(count),
  negative: value !== null && value < 0 && formatPercent(value).startsWith('−'),
})

export interface Metric {
  label: string
  cell: Cell
}

export interface Table {
  /** 先頭の列（名前）の見出しは含めない */
  columns: string[]
  rows: { label: string; cells: Cell[] }[]
}

type Cells = { columns: string[]; cells: Cell[] }

function serveCells(records: Parameters<typeof serveStatsOf>[0]): Cells {
  const s = serveStatsOf(records)
  return {
    columns: ['打数', 'サーブ効果率', 'エース率', 'ミス率'],
    cells: [
      countCell(s.attempts),
      rateCell(s.efficiency, s.attempts),
      rateCell(s.aceRate, s.attempts),
      rateCell(s.missRate, s.attempts),
    ],
  }
}

function receptionCells(records: Parameters<typeof receptionStatsOf>[0]): Cells {
  const s = receptionStatsOf(records)
  return {
    columns: ['受数', 'サーブレシーブ成功率', '被エース率'],
    cells: [
      countCell(s.receptions),
      rateCell(s.successRate, s.receptions),
      rateCell(s.acedRate, s.receptions),
    ],
  }
}

function attackCells(records: Parameters<typeof attackStatsOf>[0]): Cells {
  const s = attackStatsOf(records)
  return {
    columns: ['打数', 'アタック決定率', '効果率', '失点'],
    cells: [
      countCell(s.attempts),
      rateCell(s.killRate, s.attempts),
      rateCell(s.efficiency, s.attempts),
      countCell(s.errors),
    ],
  }
}

const flat = {
  serves: (sets: readonly SetRecords[]) => sets.flatMap((s) => s.serves),
  receptions: (sets: readonly SetRecords[]) => sets.flatMap((s) => s.receptions),
  attacks: (sets: readonly SetRecords[]) => sets.flatMap((s) => s.attacks),
}

function cellsOf(tab: Tab, sets: readonly SetRecords[]): Cells {
  switch (tab) {
    case 'serve':
      return serveCells(flat.serves(sets))
    case 'reception':
      return receptionCells(flat.receptions(sets))
    case 'attack':
      return attackCells(flat.attacks(sets))
  }
}

/** 全体指標。サーブ：打数・サーブ効果率・エース率・ミス率／レシーブ：受数・成功率・被エース率／アタック：打数・決定率・効果率・失点 */
export function overallMetrics(tab: Tab, sets: readonly SetRecords[]): Metric[] {
  const { columns, cells } = cellsOf(tab, sets)
  return columns.map((label, i) => ({ label, cell: cells[i] ?? countCell(0) }))
}

/** 「7 渡辺」のように背番号と名前を並べる。選手が見つからないときは「?」 */
export const playerLabel = (p: Player | undefined): string =>
  p ? `${p.number} ${p.name}` : '?'

/** 選手別表。背番号順 */
export function playerTable(
  tab: Tab,
  sets: readonly SetRecords[],
  players: readonly Player[],
): Table {
  const byId = new Map(players.map((p) => [p.id, p]))
  const serves = flat.serves(sets)
  const receptions = flat.receptions(sets)
  const attacks = flat.attacks(sets)
  let ids: string[]
  let cellsFor: (id: string) => Cells
  switch (tab) {
    case 'serve':
      ids = [...serveStatsByPlayer(serves).keys()]
      cellsFor = (id) => serveCells(serves.filter((s) => s.serverId === id))
      break
    case 'reception':
      ids = [...receptionStatsByPlayer(receptions).keys()]
      cellsFor = (id) => receptionCells(receptions.filter((r) => r.receiverId === id))
      break
    case 'attack':
      ids = [...attackStatsByPlayer(attacks).keys()]
      cellsFor = (id) => attackCells(attacks.filter((a) => a.attackerId === id))
      break
  }
  ids.sort((a, b) => (byId.get(a)?.number ?? 999) - (byId.get(b)?.number ?? 999))
  return {
    columns: cellsOf(tab, []).columns,
    rows: ids.map((id) => ({ label: playerLabel(byId.get(id)), cells: cellsFor(id).cells })),
  }
}

/** サーブの種類別の表 */
export function serveTypeTable(sets: readonly SetRecords[]): Table {
  const serves = flat.serves(sets)
  const by = serveStatsByType(serves)
  const order: ServeType[] = ['float', 'jump_float', 'jump', 'other']
  return {
    columns: serveCells([]).columns,
    rows: order
      .filter((t) => by.has(t))
      .map((t) => ({
        label: SERVE_TYPE_LABELS[t],
        cells: serveCells(serves.filter((s) => s.serveType === t)).cells,
      })),
  }
}

// ---- ヒートマップ ----

export interface HeatCell {
  zone: number
  text: string
  count: number
  reference: boolean
  /** 色の濃さ 0〜1。値がないときは 0 */
  intensity: number
}

export interface Heatmap {
  /** 相手コートか自コートか。ゾーンの並びが変わる */
  side: 'opponent' | 'own'
  /** 値の名前。例：サーブ効果率 */
  metric: string
  cells: HeatCell[]
}

const intensityOf = (value: number | null): number =>
  value === null ? 0 : Math.min(1, Math.max(0, value / 100))

/**
 * サーブ：相手コートの着弾ゾーン別のサーブ効果率。レシーブ：自コートの受けた位置別のサーブレシーブ成功率。
 * アタックのヒートマップはない（着弾点は任意項目で、F-11 にも求められていない）
 */
export function heatmap(tab: 'serve' | 'reception', sets: readonly SetRecords[]): Heatmap {
  if (tab === 'serve') {
    const by = serveStatsByLandingZone(flat.serves(sets))
    return {
      side: 'opponent',
      metric: 'サーブ効果率',
      cells: [...by].map(([zone, s]) => ({
        zone,
        text: formatZoneCell(s.efficiency, s.attempts),
        count: s.attempts,
        reference: s.efficiency !== null && isReference(s.attempts),
        intensity: intensityOf(s.efficiency),
      })),
    }
  }
  const by = receptionStatsByZone(flat.receptions(sets))
  return {
    side: 'own',
    metric: 'サーブレシーブ成功率',
    cells: [...by].map(([zone, s]) => ({
      zone,
      text: formatZoneCell(s.successRate, s.receptions),
      count: s.receptions,
      reference: s.successRate !== null && isReference(s.receptions),
      intensity: intensityOf(s.successRate),
    })),
  }
}

// ---- 練習 ----

export interface PracticeView {
  metrics: Metric[]
  table: Table
  /** 狙ったゾーン別のゾーン的中率 */
  heatmap: Heatmap
}

const practiceCells = (s: PracticeStats): Cell[] => [
  countCell(s.attempts),
  rateCell(s.successRate, s.attempts),
  rateCell(s.zoneHitRate, s.targeted),
]

const PRACTICE_COLUMNS = ['本数', '成功率', 'ゾーン的中率']

export function practiceView(sets: readonly SetRecords[], players: readonly Player[]): PracticeView {
  const serves = flat.serves(sets)
  const byId = new Map(players.map((p) => [p.id, p]))
  const byPlayer = practiceStatsByPlayer(serves)
  const ids = [...byPlayer.keys()].sort(
    (a, b) => (byId.get(a)?.number ?? 999) - (byId.get(b)?.number ?? 999),
  )
  const cells = practiceCells(practiceStatsOf(serves))
  return {
    metrics: PRACTICE_COLUMNS.map((label, i) => ({ label, cell: cells[i] ?? countCell(0) })),
    table: {
      columns: PRACTICE_COLUMNS,
      rows: ids.map((id) => ({
        label: playerLabel(byId.get(id)),
        cells: practiceCells(byPlayer.get(id) ?? practiceStatsOf([])),
      })),
    },
    heatmap: {
      side: 'opponent',
      metric: 'ゾーン的中率',
      cells: [...practiceStatsByTargetZone(serves)].map(([zone, s]) => ({
        zone,
        text: formatZoneCell(s.zoneHitRate, s.targeted),
        count: s.targeted,
        reference: s.zoneHitRate !== null && isReference(s.targeted),
        intensity: intensityOf(s.zoneHitRate),
      })),
    },
  }
}

// ---- 範囲の選択肢 ----

export interface ScopeOption {
  value: string
  label: string
}

/** 試合・セット・相手の選択肢（練習は含めない） */
export function scopeOptions(
  kind: 'match' | 'set' | 'opponent',
  data: AnalysisData,
): ScopeOption[] {
  const matches = data.matches.filter((m) => m.kind === 'match')
  const opponentName = (id: string | null) =>
    data.opponents.find((o) => o.id === id)?.name ?? '相手未設定'
  const matchLabel = (m: Match) => `${m.date} ${opponentName(m.opponentId)}`
  switch (kind) {
    case 'match':
      return matches.map((m) => ({ value: m.id, label: matchLabel(m) }))
    case 'opponent':
      return data.opponents
        .filter((o) => matches.some((m) => m.opponentId === o.id))
        .map((o) => ({ value: o.id, label: o.name }))
    case 'set': {
      const matchById = new Map(matches.map((m) => [m.id, m]))
      return data.gameSets
        .filter((gs) => matchById.has(gs.matchId))
        .map((gs) => {
          const m = matchById.get(gs.matchId)
          return {
            value: gs.id,
            label: `${m ? matchLabel(m) : ''} 第${gs.setNo}セット`,
          }
        })
    }
  }
}
