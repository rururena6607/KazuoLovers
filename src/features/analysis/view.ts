// 分析画面に出す内容を作る（純粋な関数）。画面のコンポーネントは、ここで作った表示用の値を並べるだけにする。
// 指標と集計は lib/stats、ゾーンは lib/court を使い、式はここに持たない。
import type {
  AttackStats,
  GameSet,
  Match,
  Opponent,
  OpponentPlayer,
  Player,
  ReceptionStats,
  ServeStats,
  ServeType,
  SetRecords,
  Speed,
} from '../../contracts/index.ts'
import { zoneOf } from '../../lib/court/index.ts'
import {
  attackStatsByPlayer,
  attackStatsBySpeed,
  bTeamAttacks,
  bTeamReceptions,
  bTeamServes,
  oppPlayerMapOf,
  attackStatsOf,
  digLandingShare,
  digOriginShare,
  digStatsOf,
  practiceStatsByPlayer,
  practiceStatsByTargetZone,
  practiceStatsOf,
  receptionPositionShare,
  receptionStatsByPlayer,
  receptionStatsByZone,
  receptionStatsOf,
  serveLandingShare,
  serveStatsByLandingZone,
  serveStatsByPlayer,
  serveStatsBySpeed,
  serveStatsByType,
  serveStatsOf,
  type PracticeStats,
  type SplitsOf,
} from '../../lib/stats/index.ts'
import { formatRate, formatZoneCell, isNegativeShown, isReference } from './format.ts'

export interface AnalysisData {
  players: readonly Player[]
  opponents: readonly Opponent[]
  matches: readonly Match[]
  gameSets: readonly GameSet[]
  records: readonly SetRecords[]
  /**
   * 相手選手。紅白戦のBチームの選手（playerId で部員と結ぶ）の成績を出すのに使う（F-27）。
   * なければ（またはBチームの選手がいなければ）、紅白戦はAチーム側の記録だけで集計する
   */
  opponentPlayers?: readonly OpponentPlayer[]
}

/**
 * セットごとの列の境目（F-24）。GameSet の colSplit1・colSplit2 が両方あるセットだけ、その値を返す。
 * 相手コートのゾーンを使う集計（着弾ゾーン別・コース割合・相手のスパイクの打つ位置）に、この関数を渡す。
 * 正しくない値（0 ≤ 左 < 右 ≤ 1 でない）は、lib/court の zoneOf が 3 等分に戻す
 */
export function splitsOfSets(gameSets: readonly GameSet[]): SplitsOf {
  const bySet = new Map<string, readonly [number, number]>()
  for (const gs of gameSets) {
    if (gs.colSplit1 !== undefined && gs.colSplit2 !== undefined) bySet.set(gs.id, [gs.colSplit1, gs.colSplit2])
  }
  return (setId) => bySet.get(setId)
}

/**
 * 範囲の選択。all は試合（kind = match）すべて、practice は練習（kind = practice）と紅白戦（kind = scrimmage）すべて。
 * 練習と紅白戦は公式の指標と物差しが違うので、試合の全体・相手には混ぜない（要件定義書 5 章「紅白戦の個人成績」）。
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
        return match.kind === 'practice' || match.kind === 'scrimmage'
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

/**
 * 範囲「練習」の記録を、紅白戦とサーブ練習に分ける（5 章）。紅白戦は試合と同じ指標で、サーブ練習は成功率・ゾーン的中率で出す。
 * 紅白戦のサーブには狙ったゾーンがなく、結果が ace／in／miss なので、サーブ練習の指標には混ぜない
 */
export function splitPractice(
  sets: readonly SetRecords[],
  data: AnalysisData,
): { scrimmage: SetRecords[]; scrimmageForTypes: SetRecords[]; drill: SetRecords[] } {
  const matchById = new Map(data.matches.map((m) => [m.id, m]))
  const kindOfSet = new Map(data.gameSets.map((gs) => [gs.id, matchById.get(gs.matchId)?.kind]))
  const members = oppPlayerMapOf(data.opponentPlayers ?? [])
  const scrimmageSets = sets.filter((r) => kindOfSet.get(r.setId) === 'scrimmage')
  return {
    scrimmage: scrimmageSets.map((r) => withBTeam(r, members)),
    // サーブの種類別の表用。Bのサーブは種類が記録された本数だけ（空の本数を「その他」に混ぜない）
    scrimmageForTypes: scrimmageSets.map((r) => withBTeam(r, members, true)),
    drill: sets.filter((r) => kindOfSet.get(r.setId) === 'practice'),
  }
}

/**
 * 紅白戦の記録に、Bチームの成績を足す（5 章「紅白戦の個人成績」）。Bの記録は、Aの記録を裏返したものを
 * 「その部員の記録」の形に読み替えて足す（lib/stats の bTeamServes など）。部員が分かる本数だけが入る
 */
function withBTeam(
  r: SetRecords,
  members: ReturnType<typeof oppPlayerMapOf>,
  knownTypeOnly = false,
): SetRecords {
  if (members.size === 0) return r
  return {
    ...r,
    serves: [...r.serves, ...bTeamServes(r.receptions, members, { knownTypeOnly })],
    receptions: [...r.receptions, ...bTeamReceptions(r.serves, members)],
    attacks: [...r.attacks, ...bTeamAttacks(r.oppAttacks ?? [], members)],
  }
}

/** 紅白戦の画面の注。Aチーム側とBチーム側の記録を、その部員の成績に入れている（5 章「紅白戦の個人成績」） */
export const SCRIMMAGE_NOTE =
  '紅白戦は、Aチーム側とBチーム側の記録を、その部員の成績として集計しています。Bチームの成績は、相手サーバー・受けた相手・打った相手選手が入っている記録だけが入ります（入っていない記録はどの部員にも入りません）。'

/** レシーブのタブの注。Bチームのエースとミスは受けた相手が記録されないので、受数に入らない */
export const SCRIMMAGE_RECEPTION_NOTE =
  'Bチームのサーブレシーブ成功率は、受けた相手が記録されたA〜Dの本数だけなので、少し高めに出ることがあります（被エースは入りません）。'

/** アタックのタブの注。被ブロックの記録がないので、Bチームの効果率と失点は出さない */
export const SCRIMMAGE_ATTACK_NOTE =
  'アタックは、Bチームに被ブロックの記録がないため、打数とアタック決定率だけを出しています。'

/** 紅白戦のアタックの表から、効果率と失点の列を除く（Bチームの被ブロックが記録されないため） */
const ATTACK_HIDDEN = new Set(['効果率', '失点'])
export const attackMetricsForScrimmage = (metrics: readonly Metric[]): Metric[] =>
  metrics.filter((m) => !ATTACK_HIDDEN.has(m.label))
export function attackTableForScrimmage(t: Table): Table {
  const keep = t.columns.map((c) => !ATTACK_HIDDEN.has(c))
  return {
    columns: t.columns.filter((_, i) => keep[i]),
    rows: t.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => keep[i]) })),
  }
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

export const SPEED_LABELS: Record<Speed, string> = { fast: '速い', slow: '遅い' }

/**
 * 速さ別の表（F-26）。サーブ・アタックの全体指標と同じ式で出す（5 章「速さ別の成績」）。
 * 速さを入れなかった本数は、どちらにも入れない。速さを入れた記録がなければ null（レシーブにはない）
 */
export function speedTable(tab: Tab, sets: readonly SetRecords[]): Table | null {
  const rowsOf = <S,>(by: Map<Speed, S>, cellsOf: (s: S) => Cells): TableRow[] =>
    [...by].map(([speed, s]) => ({ id: speed, label: SPEED_LABELS[speed], cells: cellsOf(s).cells }))
  switch (tab) {
    case 'serve': {
      const rows = rowsOf(serveStatsBySpeed(flat.serves(sets)), serveCells)
      return rows.length === 0 ? null : { columns: SERVE_COLUMNS, rows }
    }
    case 'attack': {
      const rows = rowsOf(attackStatsBySpeed(flat.attacks(sets)), attackCells)
      return rows.length === 0 ? null : { columns: ATTACK_COLUMNS, rows }
    }
    case 'reception':
      return null
  }
}

/** 速さ別の表の注。速さは任意項目なので、入れなかった本数は含まれない */
export const SPEED_NOTE = '速さ別は、速さを入力した本数だけで集計しています（入力していない本数は含めません）。'

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
export function heatmap(
  tab: 'serve' | 'reception',
  sets: readonly SetRecords[],
  splitsOf?: SplitsOf,
): Heatmap {
  if (tab === 'serve') {
    const by = serveStatsByLandingZone(flat.serves(sets), zoneOf, splitsOf)
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

/**
 * コース割合のヒートマップ（要件定義書 5 章「コース」）。値は、座標のある記録の本数に対するそのゾーンの割合。
 * サーブ：相手コートの着弾ゾーン別（自チームがどこに打てているか）。
 * レシーブ：自コートの受けた位置別（相手がどこに打ってくるか）。アタックにはない。
 * セルの本数はそのゾーンの本数で、10 本未満には「*」を付ける（ほかのヒートマップと同じ決まり）
 */
export function courseHeatmap(
  tab: 'serve' | 'reception',
  sets: readonly SetRecords[],
  splitsOf?: SplitsOf,
): Heatmap {
  const share =
    tab === 'serve'
      ? serveLandingShare(flat.serves(sets), zoneOf, splitsOf)
      : receptionPositionShare(flat.receptions(sets), zoneOf)
  return makeHeatmap(
    tab === 'serve' ? 'opponent' : 'own',
    'コース割合',
    [...share.zones].map(([zone, z]) => ({ zone, value: z.share, count: z.count })),
  )
}

/** コース割合の分母の説明（画面の注）。アウトとネットの扱いを隠さずに書く */
export const COURSE_NOTES = {
  serve: 'コース割合は、着弾点を記録したサーブに対する割合です（コートの外のアウトは含み、ネットは除く）。',
  reception: 'コース割合は、受けた位置を記録したレシーブに対する割合です。',
} as const

// ---- 相手のスパイク（F-25） ----

export interface DigView {
  /** 本数・拾えた率・拾えず・相手ミス */
  metrics: Metric[]
  /** 落ちた位置の割合（自コート） */
  landing: Heatmap
  /** 打ってくる位置の割合（相手コート） */
  origin: Heatmap
}

/**
 * 相手のスパイクの分析（要件定義書 5 章「相手のスパイク」）。
 * 拾えた率 = 拾えた（A〜D）÷（拾えた ＋ 拾えず）。相手ミスは分母に入れない（分母の本数が 10 本未満なら「*」）。
 * 位置の割合は、位置を記録した本数に対するそのゾーンの割合
 */
export function digView(sets: readonly SetRecords[], splitsOf?: SplitsOf): DigView {
  const records = sets.flatMap((s) => s.oppAttacks ?? [])
  const stats = digStatsOf(records)
  const landing = digLandingShare(records, zoneOf)
  const origin = digOriginShare(records, zoneOf, splitsOf)
  const toValues = (share: typeof landing): ZoneValue[] =>
    [...share.zones].map(([zone, z]) => ({ zone, value: z.share, count: z.count }))
  return {
    metrics: [
      { label: '相手のスパイク', cell: countCell(stats.total) },
      { label: '拾えた率', cell: rateCell(stats.digRate, stats.dug + stats.killed) },
      { label: '拾えず', cell: countCell(stats.killed) },
      { label: '相手ミス', cell: countCell(stats.oppError) },
    ],
    landing: makeHeatmap('own', '落ちた位置の割合', toValues(landing)),
    origin: makeHeatmap('opponent', '打ってくる位置の割合', toValues(origin)),
  }
}

/** 相手のスパイクの分母の説明（画面の注） */
export const DIG_NOTE =
  '拾えた率は、拾えた（A〜D）÷（拾えた＋拾えず）です（相手ミスは含めません）。位置の割合は、位置を記録したスパイクに対する割合です。'

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
