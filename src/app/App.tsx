import { useEffect, useState } from 'react'
import { createFakeRecordRepository } from '../lib/data/fakeRecordRepository.ts'
import { DEMO_MATCH, DEMO_SETS } from '../features/record/demo.ts'
import RecordScreen from '../features/record/RecordScreen.tsx'
import InstallGuide from './InstallGuide.tsx'
import TabBar from './TabBar.tsx'
import type { TabId } from './tabs.ts'
import UpdatePrompt from './UpdatePrompt.tsx'

// 本物の RecordRepository（T-14・T-15、ひろし）ができたら、ここで差し替える。
const repo = createFakeRecordRepository({
  [DEMO_MATCH.id]: DEMO_SETS.map((s) => s.id),
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

export default function App() {
  const [tab, setTab] = useState<TabId>('record')
  const [pending, setPending] = useState(0)

  useEffect(() => repo.subscribePending(setPending), [])

  return (
    <div className="app">
      <UpdatePrompt pending={pending} />
      <InstallGuide />
      <main className="app-main">
        {tab === 'record' && <RecordScreen repo={repo} />}
        {tab === 'analysis' && <Placeholder title="分析" task="T-21" />}
        {tab === 'admin' && <Placeholder title="管理" task="T-10" />}
      </main>
      <TabBar active={tab} onSelect={setTab} />
    </div>
  )
}
