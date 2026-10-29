import { useState } from 'react'
import InstallGuide from './InstallGuide.tsx'
import TabBar from './TabBar.tsx'
import type { TabId } from './tabs.ts'
import UpdatePrompt from './UpdatePrompt.tsx'

// 分析（とりはる）と管理（ひろし）の画面は、できたらここで差し替える。
function Placeholder({ title, task }: { title: string; task: string }) {
  return (
    <section className="placeholder">
      <h1>{title}</h1>
      <p>{task} で作ります。</p>
    </section>
  )
}

export default function App() {
  const [tab, setTab] = useState<TabId>('record')

  return (
    <div className="app">
      {/* 未送信の件数は T-11 で RecordRepository とつなぐ */}
      <UpdatePrompt pending={0} />
      <InstallGuide />
      <main className="app-main">
        {tab === 'record' && <Placeholder title="記録" task="T-11" />}
        {tab === 'analysis' && <Placeholder title="分析" task="T-21" />}
        {tab === 'admin' && <Placeholder title="管理" task="T-10" />}
      </main>
      <TabBar active={tab} onSelect={setTab} />
    </div>
  )
}
