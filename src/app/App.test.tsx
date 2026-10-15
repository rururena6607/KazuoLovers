import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import App from './App.tsx'

describe('App', () => {
  it('雛形のページが描画できる', () => {
    expect(renderToString(<App />)).toContain('サーブレシーブ記録')
  })
})
