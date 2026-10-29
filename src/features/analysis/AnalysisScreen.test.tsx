import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MIN_SAMPLE } from '../../contracts/index.ts'
import { AnalysisScreen } from './AnalysisScreen.tsx'
import type { AnalysisData } from './view.ts'

const data: AnalysisData = {
  players: [{ id: 'p7', teamId: 't', number: 7, name: '渡辺', position: null, serveType: 'float', active: true }],
  opponents: [{ id: 'o1', teamId: 't', name: 'A高校' }],
  matches: [
    { id: 'm1', teamId: 't', kind: 'match', opponentId: 'o1', date: '2026-10-20', tournament: null, setPoints: 25 },
  ],
  gameSets: [{ id: 's1', matchId: 'm1', setNo: 1, ourScore: 0, oppScore: 0 }],
  records: [
    {
      setId: 's1',
      serves: [
        {
          kind: 'serve',
          clientId: 'c1',
          setId: 's1',
          serverId: 'p7',
          serveType: 'float',
          fromX: 0.5,
          toX: 0.1,
          toY: 0.1,
          result: 'ace',
          missType: null,
          reception: null,
          receiverId: null,
          targetZone: null,
          recordedAt: '2026-10-20T00:00:00Z',
        },
      ],
      receptions: [],
      attacks: [],
      points: [],
    },
  ],
}

describe('AnalysisScreen', () => {
  const html = renderToString(<AnalysisScreen data={data} />)

  it('範囲の選択と、サーブの全体指標・ヒートマップ・選手別表を出す', () => {
    for (const text of ['全体', '試合', 'セット', '相手', '練習']) expect(html).toContain(text)
    for (const text of ['サーブ効果率', 'エース率', 'ミス率']) expect(html).toContain(text)
    expect(html).toContain('100.0%*')
    expect(html).toContain('7 渡辺')
  })

  it('ヒートマップに 6 つのゾーン番号と値（本数）を出す', () => {
    expect(html).toContain('100.0%*（1）')
    expect(html).toContain('−（0）')
    expect((html.match(/class="an-zone[ "]/g) ?? []).length).toBe(6)
  })

  it('参考値の説明を出す', () => {
    expect(html).toContain(`${MIN_SAMPLE} 本未満の参考値`)
  })
})
