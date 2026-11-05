import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_OPP_PLAYERS, DEMO_PLAYERS, DEMO_SETS } from '../features/record/demo.ts'
import RecordScreen from '../features/record/RecordScreen.tsx'
import App from './App.tsx'
import { createDemoBackend } from './backend.ts'

describe('App', () => {
  it('キーがなければデモで動き、最初は記録のタブでデモの試合を読む', () => {
    const html = renderToString(<App />)
    expect(html).toContain('class="tabbar"')
    expect(html).toContain('デモ（記録は保存されません）')
    expect(html).toContain('試合を読んでいます')
  })

  it('選択中以外の画面も描いたまま hidden で隠す', () => {
    const html = renderToString(<App />)
    // 分析のタブは開くまで読まない
    expect(html).toMatch(/<div hidden="">(<!-- -->)?<section class="placeholder" aria-busy="true"><p>分析のデータ/)
    expect(html).toMatch(/<div hidden="">(<!-- -->)?<section class="placeholder"><h1>管理<\/h1>/)
  })

  it('読んだ試合を記録画面に出す（相手の名前・セット・何セットマッチか）', () => {
    const { repo } = createDemoBackend()
    const ctx = {
      match: DEMO_MATCH,
      opponent: DEMO_OPPONENT,
      sets: [DEMO_SETS[0]],
      players: [...DEMO_PLAYERS],
      opponentPlayers: [...DEMO_OPP_PLAYERS],
    }
    const html = renderToString(<RecordScreen repo={repo} ctx={ctx} onNextSet={() => Promise.resolve()} />)
    expect(html).toContain('自チームのサーブ')
    expect(html.replaceAll("<!-- -->", "")).toContain(`vs ${DEMO_OPPONENT.name}・第1セット`)
    expect(html.replaceAll("<!-- -->", "")).toContain("3セットマッチ")
    // onPractice がなければ練習モードのボタンを出さない
    expect(html).not.toContain('練習モード')
  })
})
