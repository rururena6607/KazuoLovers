import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import App from './App.tsx'

describe('App', () => {
  it('最初は記録のタブを開き、タブバーを出す', () => {
    const html = renderToString(<App />)
    expect(html).toContain('class="tabbar"')
    expect(html).toContain('自チームのサーブ')
  })

  it('選択中以外の画面も描いたまま hidden で隠す', () => {
    const html = renderToString(<App />)
    expect(html).toMatch(/<div hidden="">(<!-- -->)?<section class="placeholder"><h1>分析<\/h1>/)
    expect(html).toMatch(/<div hidden="">(<!-- -->)?<section class="placeholder"><h1>管理<\/h1>/)
  })
})
