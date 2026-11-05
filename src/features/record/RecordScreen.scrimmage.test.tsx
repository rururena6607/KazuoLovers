import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { MatchContext, OpponentPlayer } from '../../contracts/index.ts'
import { createDemoBackend } from '../../app/backend.ts'
import { DEMO_MATCH, DEMO_PLAYERS, DEMO_SETS } from './demo.ts'
import RecordScreen from './RecordScreen.tsx'

// 紅白戦（F-27）の記録画面：B チームの選手は部員の名前で出し、A チームの選択肢から外す
const B = { id: 'o-b', teamId: DEMO_MATCH.teamId, name: '紅白戦（B チーム）' }
const bPlayer = (playerId: string, number: number): OpponentPlayer => ({
  id: `b-${playerId}`,
  opponentId: B.id,
  number,
  playerId,
})

const render = (ctx: MatchContext) => {
  const { repo } = createDemoBackend()
  return renderToString(<RecordScreen repo={repo} ctx={ctx} onNextSet={() => Promise.resolve()} />).replaceAll(
    '<!-- -->',
    '',
  )
}

describe('RecordScreen（紅白戦）', () => {
  const ctx: MatchContext = {
    match: { ...DEMO_MATCH, kind: 'scrimmage', opponentId: B.id },
    opponent: B,
    sets: [DEMO_SETS[0]],
    players: [...DEMO_PLAYERS],
    opponentPlayers: [bPlayer('p7', 7), bPlayer('p8', 8)],
  }
  const count = (html: string, text: string) => html.split(text).length - 1

  it('B チームの部員は「背番号 名前」で出し、A チームのボタンには出さない', () => {
    const html = render(ctx)
    expect(html).toContain('vs 紅白戦（B チーム）')
    // 自チームのサーブの「受けた相手」と、相手のサーブの「相手サーバー」の 2 か所だけ（A チームの選手のボタンには出ない）
    expect(count(html, '7 渡辺')).toBe(2)
    expect(count(html, '8 伊藤')).toBe(2)
    // B チームにいない部員は、A チームの選択肢（サーバー・レシーバー）に出る
    expect(count(html, '1 佐藤')).toBe(2)
  })

  it('ふつうの試合では、相手選手は背番号だけで、部員は全員 A チームに出る', () => {
    const html = render({ ...ctx, match: DEMO_MATCH, opponentPlayers: [{ id: 'o7', opponentId: B.id, number: 7 }] })
    expect(count(html, '7 渡辺')).toBe(2)
  })
})
