import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import App from './App.tsx'

describe('App', () => {
  it('最初は記録のタブを開き、タブバーを出す', () => {
    const html = renderToString(<App />)
    expect(html).toContain('class="tabbar"')
    expect(html).toContain('自チームのサーブ')
  })
})
