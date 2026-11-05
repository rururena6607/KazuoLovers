import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import TabBar from './TabBar.tsx'

describe('TabBar', () => {
  it('4つのタブを出す（作戦ボードを含む）', () => {
    const html = renderToString(<TabBar active="record" onSelect={() => {}} />)
    expect(html).toContain('記録')
    expect(html).toContain('分析')
    expect(html).toContain('作戦')
    expect(html).toContain('管理')
  })

  it('選択中のタブだけに aria-current="page" を付ける', () => {
    const html = renderToString(<TabBar active="analysis" onSelect={() => {}} />)
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-current="page"[^>]*>分析</)
  })
})
