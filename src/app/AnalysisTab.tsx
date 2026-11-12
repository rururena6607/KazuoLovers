import { useEffect, useMemo, useState } from 'react'
import type { RecordRepository, SetRecords } from '../contracts/index.ts'
import { AnalysisScreen, type AnalysisData } from '../features/analysis/index.ts'
import type { AiReports } from '../lib/data/aiReport.ts'
import type { LoadTeam, TeamSnapshot } from './analysisData.ts'

// 分析のタブ（とりはるの AnalysisScreen）に、チームのデータと全試合の記録を渡す。
// タブを開くたびに試合・セットを読み直す（記録のタブで足した試合・セットを出すため）。
// 記録は試合ごとに購読するので、ほかの端末の記録も入ってくる。

interface Props {
  repo: RecordRepository
  loadTeam: LoadTeam
  /** このタブを開いているか。開いたときに読み直す */
  active: boolean
  onChooseMatch: () => void
  /** AI コメント（T-32・F-13）。本物（Supabase）のときだけ渡す。渡さなければ、AI コメントの欄は出ない */
  aiReports?: AiReports
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'noTeam' }
  | { kind: 'ready'; team: TeamSnapshot }

export default function AnalysisTab({ repo, loadTeam, active, onChooseMatch, aiReports }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [records, setRecords] = useState<ReadonlyMap<string, SetRecords[]>>(new Map())

  useEffect(() => {
    if (!active) return
    let alive = true
    loadTeam()
      .then((team) => alive && setState(team ? { kind: 'ready', team } : { kind: 'noTeam' }))
      .catch((e: unknown) => {
        console.error(e)
        if (alive) setState({ kind: 'error' })
      })
    return () => {
      alive = false
    }
  }, [active, loadTeam])

  const matchIds = state.kind === 'ready' ? state.team.matches.map((m) => m.id).join(',') : ''
  useEffect(() => {
    if (matchIds === '') return
    const offs = matchIds
      .split(',')
      .map((id) => repo.subscribe(id, (sets) => setRecords((r) => new Map(r).set(id, sets))))
    return () => offs.forEach((off) => off())
  }, [repo, matchIds])

  const data: AnalysisData | null = useMemo(
    () =>
      state.kind === 'ready'
        ? { ...state.team, records: [...records.values()].flat() }
        : null,
    [state, records],
  )

  if (state.kind === 'loading') {
    return (
      <section className="placeholder" aria-busy="true">
        <p>分析のデータを読んでいます…</p>
      </section>
    )
  }
  if (state.kind === 'error') {
    return (
      <section className="placeholder">
        <p className="error" role="alert">
          データを読めませんでした。電波を確かめて、タブを開き直してください
        </p>
      </section>
    )
  }
  if (state.kind === 'noTeam' || !data || data.matches.length === 0) {
    return (
      <section className="placeholder">
        <h1>分析</h1>
        <p>まだ試合がありません。管理のタブで試合を作って記録すると、ここに出ます。</p>
        <button type="button" className="btn" onClick={onChooseMatch}>
          管理のタブへ
        </button>
      </section>
    )
  }
  // チームの id は試合から取る（分析は試合があるときだけ出すので、いつもある。どの試合も同じチーム）
  const teamId = data.matches[0]?.teamId
  const ai = aiReports && teamId ? { teamId, aiReports } : undefined
  return <AnalysisScreen data={data} ai={ai} />
}
