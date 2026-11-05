import { useState, type ReactNode } from 'react'
import { createFakeRecordRepository } from '../lib/data/fakeRecordRepository.ts'
import InstallGuide from './InstallGuide.tsx'
import TabBar from './TabBar.tsx'
import { TABS, type TabId } from './tabs.ts'
import UpdatePrompt from './UpdatePrompt.tsx'

// 本物の RecordRepository（T-14・T-15、ひろし）ができたら、ここで差し替える。
const repo = createFakeRecordRepository({})

// 分析（とりはる）と管理（ひろし）の画面は、できたらここで差し替える。
function Placeholder({ title, task }: { title: string; task: string }) {
  return (
    <section className="placeholder">
      <h1>{title}</h1>
      <p>{task} で作ります。</p>
    </section>
  )
}

// タブと画面の対応。TabId を足してここを書き忘れると型エラーになる。
const SCREENS: Record<TabId, ReactNode> = {
  record: <Placeholder title="記録" task="T-11" />,
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
