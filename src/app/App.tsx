import { useState, type ReactNode } from 'react'
import { createFakeRecordRepository } from '../lib/data/fakeRecordRepository.ts'
import PracticeScreen from '../features/practice/PracticeScreen.tsx'
import { DEMO_MATCH, DEMO_PRACTICE, DEMO_PRACTICE_SET, DEMO_SETS } from '../features/record/demo.ts'
import RecordScreen from '../features/record/RecordScreen.tsx'
import InstallGuide from './InstallGuide.tsx'
import TabBar from './TabBar.tsx'
import { TABS, type TabId } from './tabs.ts'
import UpdatePrompt from './UpdatePrompt.tsx'

// 本物の RecordRepository（T-14・T-15、ひろし）ができたら、ここで差し替える。
const repo = createFakeRecordRepository({
  [DEMO_MATCH.id]: DEMO_SETS.map((s) => s.id),
  [DEMO_PRACTICE.id]: [DEMO_PRACTICE_SET.id],
})

// 分析（とりはる）と管理（ひろし）の画面は、できたらここで差し替える。
function Placeholder({ title, task }: { title: string; task: string }) {
  return (
    <section className="placeholder">
      <h1>{title}</h1>
      <p>{task} で作ります。</p>
    </section>
  )
}

/** 記録のタブ：試合の記録と練習モード。切り替えても両方描いたまま隠し、試合の記録の状態を残す */
function RecordTab() {
  const [practice, setPractice] = useState(false)
  return (
    <>
      <div hidden={practice}>
        <RecordScreen repo={repo} onPractice={() => setPractice(true)} />
      </div>
      <div hidden={!practice}>
        <PracticeScreen repo={repo} onExit={() => setPractice(false)} />
      </div>
    </>
  )
}

// タブと画面の対応。TabId を足してここを書き忘れると型エラーになる。
const SCREENS: Record<TabId, ReactNode> = {
  record: <RecordTab />,
  analysis: <Placeholder title="分析" task="T-21" />,
  admin: <Placeholder title="管理" task="T-10" />,
}

export default function App() {
  const [tab, setTab] = useState<TabId>('record')

  const select = (id: TabId) => {
    setTab(id)
    window.scrollTo(0, 0)
  }

  // 入力途中の状態を残すため、画面は描いたまま選択中以外を hidden で隠す
  return (
    <div className="app">
      <UpdatePrompt repo={repo} />
      <InstallGuide />
      <main className="app-main">
        {TABS.map(({ id }) => (
          <div key={id} hidden={id !== tab}>
            {SCREENS[id]}
          </div>
        ))}
      </main>
      <TabBar active={tab} onSelect={select} />
    </div>
  )
}
