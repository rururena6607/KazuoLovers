import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AiCommentView } from './AiCommentPanel.tsx'

const noop = () => undefined
const comment = {
  comment: '【良かった点】\n・7番のサーブが安定\n【課題】\n・レシーブ',
  cached: true,
  createdAt: '2026-11-05T01:00:00Z',
}

describe('AiCommentView', () => {
  it('まだコメントがなければ「AIに分析してもらう」を出す。名前を送らないことも書く', () => {
    const html = renderToString(
      <AiCommentView available={{ ok: true }} comment={null} busy={false} error={null} onRequest={noop} />,
    )
    expect(html).toContain('AIに分析してもらう')
    expect(html).toContain('名前は送らず')
  })

  it('保存済みのコメントは見出しごとに出し、ボタンは「作り直す」になる', () => {
    const html = renderToString(
      <AiCommentView available={{ ok: true }} comment={comment} busy={false} error={null} onRequest={noop} />,
    )
    expect(html).toContain('良かった点')
    expect(html).toContain('7番のサーブが安定')
    expect(html).toContain('作り直す')
    expect(html).toContain('保存済み')
    expect(html).toContain('参考程度')
  })

  it('作っている間はボタンを押せない。失敗したら理由を出す', () => {
    const busy = renderToString(
      <AiCommentView available={{ ok: true }} comment={null} busy error={null} onRequest={noop} />,
    )
    expect(busy).toContain('考えています')
    expect(busy).toContain('disabled')
    const failed = renderToString(
      <AiCommentView available={{ ok: true }} comment={null} busy={false} error="今日の回数の上限です。" onRequest={noop} />,
    )
    expect(failed).toContain('今日の回数の上限です。')
  })

  it('作れない範囲ではボタンを出さず、理由を出す', () => {
    const html = renderToString(
      <AiCommentView
        available={{ ok: false, reason: '練習はAIコメントの対象外です。' }}
        comment={null}
        busy={false}
        error={null}
        onRequest={noop}
      />,
    )
    expect(html).toContain('練習はAIコメントの対象外です。')
    expect(html).not.toContain('AIに分析してもらう')
  })
})
