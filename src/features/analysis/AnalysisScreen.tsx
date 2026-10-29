import { useMemo, useState } from 'react'
import './analysis.css'
import { Heatmap } from './Heatmap.tsx'
import { ScoreTrend, SetResults } from './SetResults.tsx'
import { MetricRow, StatTable } from './StatTable.tsx'
import { scoreTrend, setResults } from './setResults.ts'
import {
  TAB_LABELS,
  heatmap,
  overallMetrics,
  playerTable,
  practiceView,
  recordsInScope,
  scopeOptions,
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

/** 分析画面（T-21）。範囲を選び、サーブ・レシーブ・アタックの全体指標、選手別表、ヒートマップを出す */
export function AnalysisScreen({
  data,
  initialKind = 'all',
}: {
  data: AnalysisData
  /** 最初に開く範囲。試合の結果画面から開くときは 'match' */
  initialKind?: ScopeKind
}) {
  const [kind, setKind] = useState<ScopeKind>(initialKind)
  const [targets, setTargets] = useState<Partial<Record<ScopeKind, string>>>({})
  const [tab, setTab] = useState<Tab>('serve')

  const options = useMemo(
    () => (kind === 'match' || kind === 'set' || kind === 'opponent' ? scopeOptions(kind, data) : []),
    [kind, data],
  )
  // 選択肢が変わっても、選んだものが残っていなければ先頭にする
  const chosen = targets[kind] ?? ''
  const target = options.some((o) => o.value === chosen) ? chosen : (options[0]?.value ?? '')
  const scope = toScope(kind, target)
  const sets = useMemo(() => (scope ? recordsInScope(scope, data) : []), [scope, data])

  // セット別の結果の行をタップしたら、そのセットの分析に移る
  const openSet = (setId: string) => {
    setKind('set')
    setTargets({ ...targets, set: setId })
  }

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
      {(kind === 'match' || kind === 'set' || kind === 'opponent') && options.length === 0 && (
        <p className="an-empty">選べる試合がありません</p>
      )}

      {kind === 'practice' ? (
        <PracticePanel data={data} sets={sets} />
      ) : (
        <>
          <div className="an-seg" role="group" aria-label="種類">
            {TABS.map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {scope?.kind === 'match' && <SetResults table={setResults(scope.matchId, data)} onSelect={openSet} />}
          <MetricRow metrics={overallMetrics(tab, sets)} />
          {tab !== 'attack' && <Heatmap map={heatmap(tab, sets)} />}
          {tab === 'serve' && <StatTable title="サーブの種類別" nameHeader="種類" table={serveTypeTable(sets)} />}
          <StatTable title="選手別" nameHeader="選手" table={playerTable(tab, sets, data.players)} />
          {scope?.kind === 'set' && sets[0] && <ScoreTrend rows={scoreTrend(sets[0], data.players)} />}
          <p className="an-note">* は 10 本未満の参考値です。</p>
        </>
      )}
    </div>
  )
}

function PracticePanel({ data, sets }: { data: AnalysisData; sets: ReturnType<typeof recordsInScope> }) {
  const view = practiceView(sets, data.players)
  return (
    <>
      <MetricRow metrics={view.metrics} />
      <Heatmap map={view.heatmap} />
      <StatTable title="選手別" nameHeader="選手" table={view.table} />
      <p className="an-note">* は 10 本未満の参考値です。ゾーンは狙ったゾーン別です。</p>
    </>
  )
}
