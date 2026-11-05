import { useMemo, useState } from 'react'
import { MIN_SAMPLE } from '../../contracts/index.ts'
import type { AiReports } from '../../lib/data/aiReport.ts'
import './analysis.css'
import { AiCommentPanel } from './AiCommentPanel.tsx'
import { Heatmap } from './Heatmap.tsx'
import { ScoreTrend, SetResults } from './SetResults.tsx'
import { MetricRow, StatTable } from './StatTable.tsx'
import { emptySet, scoreTrend, setResults } from './setResults.ts'
import {
  COURSE_NOTES,
  DIG_NOTE,
  SCRIMMAGE_ATTACK_NOTE,
  SCRIMMAGE_NOTE,
  SCRIMMAGE_RECEPTION_NOTE,
  TAB_LABELS,
  attackMetricsForScrimmage,
  attackTableForScrimmage,
  courseHeatmap,
  digView,
  heatmap,
  overallMetrics,
  playerTable,
  practiceView,
  recordsInScope,
  scopeOptions,
  splitPractice,
  serveTypeTable,
  type AnalysisData,
  type Scope,
  type Tab,
} from './view.ts'

type ScopeKind = Scope['kind']

const SCOPE_KINDS: { kind: ScopeKind; label: string }[] = [
  { kind: 'all', label: '全体' },
  { kind: 'match', label: '試合' },
  { kind: 'set', label: 'セット' },
  { kind: 'opponent', label: '相手' },
  { kind: 'practice', label: '練習' },
]

const TABS: Tab[] = ['serve', 'reception', 'attack']

function toScope(kind: ScopeKind, target: string): Scope | null {
  switch (kind) {
    case 'all':
    case 'practice':
      return { kind }
    case 'match':
      return target ? { kind, matchId: target } : null
    case 'set':
      return target ? { kind, setId: target } : null
    case 'opponent':
      return target ? { kind, opponentId: target } : null
  }
}

const EMPTY_MESSAGE = {
  match: '選べる試合がありません',
  set: '選べるセットがありません',
  opponent: '選べる相手がありません',
} as const

const referenceNote = `* は ${MIN_SAMPLE} 本未満の参考値です。`

/** 最初に選んでおく対象（試合・セット・相手の id）。範囲が全体・練習なら空 */
function targetOf(scope: Scope | undefined): string {
  switch (scope?.kind) {
    case 'match':
      return scope.matchId
    case 'set':
      return scope.setId
    case 'opponent':
      return scope.opponentId
    default:
      return ''
  }
}

/** 分析画面（T-21、T-22）。範囲を選び、サーブ・レシーブ・アタックの全体指標、選手別表、ヒートマップを出す */
export function AnalysisScreen({
  data,
  initialScope,
  ai,
}: {
  data: AnalysisData
  /** AI コメント（T-32）。渡さなければ出さない。aiReports は lib/data のもの（テストでは偽物）を src/app から渡す */
  ai?: { teamId: string; aiReports: AiReports }
  /** 最初に開く範囲。試合の結果画面から開くときは `{ kind: 'match', matchId }` を渡す */
  initialScope?: Scope
}) {
  const [kind, setKind] = useState<ScopeKind>(initialScope?.kind ?? 'all')
  const [targets, setTargets] = useState<Partial<Record<ScopeKind, string>>>(
    initialScope ? { [initialScope.kind]: targetOf(initialScope) } : {},
  )
  const [tab, setTab] = useState<Tab>('serve')

  const pickable = kind === 'match' || kind === 'set' || kind === 'opponent'
  const options = useMemo(() => (pickable ? scopeOptions(kind, data) : []), [pickable, kind, data])
  // 選択肢が変わっても、選んだものが残っていなければ先頭にする
  const chosen = targets[kind] ?? ''
  const target = options.some((o) => o.value === chosen) ? chosen : (options[0]?.value ?? '')
  // scope は毎回新しいオブジェクトになるので、依存には kind と target を使う
  const sets = useMemo(() => {
    const scope = toScope(kind, target)
    return scope ? recordsInScope(scope, data) : []
  }, [kind, target, data])

  const aiScope = useMemo(() => toScope(kind, target), [kind, target])

  // セット別の結果の行をタップしたら、そのセットの分析に移る
  const openSet = (setId: string) => {
    setKind('set')
    setTargets({ ...targets, set: setId })
  }

  // 範囲「練習」は、紅白戦（試合と同じ指標。メイン）とサーブ練習（成功率・ゾーン的中率。別の表）に分ける（5 章）
  const parts = useMemo(
    () => (kind === 'practice' ? splitPractice(sets, data) : null),
    [kind, sets, data],
  )
  const matchLike = parts ? parts.scrimmage : sets
  // タブを切り替えても、範囲の集計はやり直さない。表示用の値は、記録・タブ・選手が変わったときだけ作る
  const overview = useMemo(
    () => ({
      metrics:
        parts && tab === 'attack'
          ? attackMetricsForScrimmage(overallMetrics(tab, matchLike))
          : overallMetrics(tab, matchLike),
      heat: tab === 'attack' ? null : heatmap(tab, matchLike),
      course: tab === 'attack' ? null : courseHeatmap(tab, matchLike),
      dig: tab === 'reception' ? digView(matchLike) : null,
      types: tab === 'serve' ? serveTypeTable(matchLike) : null,
      players:
        parts && tab === 'attack'
          ? attackTableForScrimmage(playerTable(tab, matchLike, data.players))
          : playerTable(tab, matchLike, data.players),
    }),
    [tab, matchLike, data.players, parts],
  )
  const practice = useMemo(
    () => (parts ? practiceView(parts.drill, data.players) : null),
    [parts, data.players],
  )
  // セット別の結果と得点の推移は、タブによらない
  const results = useMemo(
    () => (kind === 'match' && target ? setResults(target, data) : null),
    [kind, target, data],
  )
  const trend = useMemo(
    () =>
      kind === 'set' && target ? scoreTrend(sets[0] ?? emptySet(target), data.players) : null,
    [kind, target, sets, data.players],
  )

  return (
    <div className="analysis">
      <h2 className="an-title">分析</h2>

      <div className="an-seg" role="group" aria-label="範囲">
        {SCOPE_KINDS.map((s) => (
          <button
            key={s.kind}
            type="button"
            aria-pressed={kind === s.kind}
            onClick={() => setKind(s.kind)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {options.length > 0 && (
        <select
          className="an-select"
          aria-label="対象"
          value={target}
          onChange={(e) => setTargets({ ...targets, [kind]: e.target.value })}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {pickable && options.length === 0 && <p className="an-empty">{EMPTY_MESSAGE[kind]}</p>}

      {parts && (
        <p className="an-note">
          練習の範囲です。紅白戦は試合と同じ指標で、サーブ練習は別の表で出します（試合の全体・相手には入りません）。
        </p>
      )}
      {parts && parts.scrimmage.length === 0 && <p className="an-empty">紅白戦の記録がありません</p>}

      {(!parts || parts.scrimmage.length > 0) && (
        <>
          {parts && <h3 className="an-part">紅白戦</h3>}
          <div className="an-seg" role="group" aria-label="種類">
            {TABS.map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {results && <SetResults table={results} onSelect={openSet} />}
          <MetricRow metrics={overview.metrics} />
          {overview.heat && <Heatmap map={overview.heat} />}
          {overview.course && (
            <>
              <Heatmap map={overview.course} />
              <p className="an-note">{tab === 'serve' ? COURSE_NOTES.serve : COURSE_NOTES.reception}</p>
            </>
          )}
          {overview.dig && (
            <section className="an-section" aria-label="相手のスパイク">
              <h3>相手のスパイク</h3>
              <MetricRow metrics={overview.dig.metrics} />
              <Heatmap map={overview.dig.landing} />
              <Heatmap map={overview.dig.origin} />
              <p className="an-note">{DIG_NOTE}</p>
            </section>
          )}
          {overview.types && <StatTable title="サーブの種類別" nameHeader="種類" table={overview.types} />}
          <StatTable title="選手別" nameHeader="選手" table={overview.players} />
          {trend && <ScoreTrend rows={trend} />}
          <p className="an-note">{referenceNote}</p>
          {parts && <p className="an-note">{SCRIMMAGE_NOTE}</p>}
          {parts && tab === 'reception' && <p className="an-note">{SCRIMMAGE_RECEPTION_NOTE}</p>}
          {parts && tab === 'attack' && <p className="an-note">{SCRIMMAGE_ATTACK_NOTE}</p>}
        </>
      )}

      {practice && parts && parts.drill.length > 0 && (
        <>
          <h3 className="an-part">サーブ練習</h3>
          <MetricRow metrics={practice.metrics} />
          <Heatmap map={practice.heatmap} />
          <StatTable title="選手別" nameHeader="選手" table={practice.table} />
          <p className="an-note">{`${referenceNote}ゾーンは狙ったゾーン別です。`}</p>
        </>
      )}

      {ai && <AiCommentPanel teamId={ai.teamId} scope={aiScope} data={data} aiReports={ai.aiReports} />}
    </div>
  )
}
