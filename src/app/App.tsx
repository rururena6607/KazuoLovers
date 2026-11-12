import { useState, type ReactNode } from 'react'
import { AdminScreen } from '../features/admin/AdminScreen.tsx'
import { AuthGate } from '../features/auth/AuthGate.tsx'
import { DEMO_MATCH, DEMO_PRACTICE } from '../features/record/demo.ts'
import RecordTab from '../features/record/RecordTab.tsx'
import AnalysisTab from './AnalysisTab.tsx'
import BoardTab from './BoardTab.tsx'
import { backend, type Backend } from './backend.ts'
import InstallGuide from './InstallGuide.tsx'
import TabBar from './TabBar.tsx'
import { TABS, type TabId } from './tabs.ts'
import UpdatePrompt from './UpdatePrompt.tsx'

/** デモ（Supabase のキーがない手元）の管理タブ */
function DemoAdmin() {
  return (
    <section className="placeholder">
      <h1>管理</h1>
      <p>
        デモで動いています（Supabase のキーがないため、記録は保存されません）。試合・選手の管理は、キーを入れると使えます。
      </p>
    </section>
  )
}

export function Shell({ b }: { b: Backend }) {
  const [tab, setTab] = useState<TabId>('record')
  // デモは最初からデモの試合を開く。本物は管理のタブで選ぶまで null
  const [matchId, setMatchId] = useState<string | null>(b.kind === 'demo' ? DEMO_MATCH.id : null)

  const select = (id: TabId) => {
    setTab(id)
    window.scrollTo(0, 0)
  }
  const openMatch = (id: string) => {
    setMatchId(id)
    select('record')
  }

  const record =
    b.kind === 'demo' ? (
      <RecordTab
        repo={b.repo}
        source={b.source}
        matchId={matchId}
        onChooseMatch={() => setMatchId(DEMO_MATCH.id)}
        onPractice={() => setMatchId(DEMO_PRACTICE.id)}
        onExitPractice={() => setMatchId(DEMO_MATCH.id)}
        exitPracticeLabel="試合の記録に戻る"
      />
    ) : (
      <RecordTab
        repo={b.repo}
        source={b.source}
        matchId={matchId}
        onChooseMatch={() => select('admin')}
        // 練習は管理のタブで「練習」を作って開く
        onPractice={() => select('admin')}
        onExitPractice={() => select('admin')}
        exitPracticeLabel="試合を選ぶ"
      />
    )

  // タブと画面の対応。TabId を足してここを書き忘れると型エラーになる。
  const screens: Record<TabId, ReactNode> = {
    record,
    analysis: (
      <AnalysisTab
        repo={b.repo}
        loadTeam={b.loadTeam}
        active={tab === 'analysis'}
        onChooseMatch={() => select('admin')}
        aiReports={b.kind === 'supabase' ? b.aiReports : undefined}
      />
    ),
    board: <BoardTab loadTeam={b.loadTeam} active={tab === 'board'} />,
    admin: b.kind === 'demo' ? <DemoAdmin /> : <AdminScreen data={b.teamData} onOpenMatch={openMatch} />,
  }

  // 入力途中の状態を残すため、画面は描いたまま選択中以外を hidden で隠す
  return (
    <div className="app">
      <UpdatePrompt repo={b.repo} />
      <InstallGuide />
      {b.kind === 'demo' && (
        <p className="demo-note" role="note">
          デモ（記録は保存されません）
        </p>
      )}
      <main className="app-main">
        {TABS.map(({ id }) => (
          <div key={id} hidden={id !== tab}>
            {screens[id]}
          </div>
        ))}
      </main>
      <TabBar active={tab} onSelect={select} />
    </div>
  )
}

export default function App() {
  if (backend.kind === 'demo') return <Shell b={backend} />
  return (
    <AuthGate auth={backend.auth}>
      <Shell b={backend} />
    </AuthGate>
  )
}
