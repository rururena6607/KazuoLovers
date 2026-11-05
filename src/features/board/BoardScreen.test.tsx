import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import BoardScreen from './BoardScreen.tsx'

describe('BoardScreen', () => {
  const html = renderToString(<BoardScreen />)

  it('コート図と、駒を置く入力、5 つの道具を出す', () => {
    expect(html).toContain('作戦ボードのコート図')
    expect(html).toContain('駒の背番号')
    for (const label of ['駒を動かす', '矢印', '守る範囲', '打つ範囲', '消す']) expect(html).toContain(label)
  })

  it('最初は「駒を動かす」が選ばれ、背番号がないので駒は置けず、戻す操作もできない', () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*>駒を動かす</)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toMatch(/<button type="submit" class="btn" disabled="">駒を置く</)
    expect(html).toMatch(/disabled="">ひとつ戻す</)
  })

  it('相手コートと自コートの向きを文字で示す', () => {
    expect(html).toContain('相手コート')
    expect(html).toContain('自コート')
  })
})
