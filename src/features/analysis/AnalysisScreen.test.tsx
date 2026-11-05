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
      points: [
        {
          kind: 'point',
          clientId: 'pt1',
          setId: 's1',
          side: 'us',
          cause: 'ace',
          sourceId: 'c1',
          ourScore: 1,
          oppScore: 0,
          recordedAt: '2026-10-20T00:00:01Z',
        },
      ],
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
    // ヒートマップは2つ（サーブ効果率とコース割合）で、どちらも 6 ゾーン
    expect((html.match(/<figure class="an-heat"/g) ?? []).length).toBe(2)
    expect((html.match(/class="an-zone[ "]/g) ?? []).length).toBe(12)
    expect(html).toContain('コース割合')
    expect(html).toContain('アウトは含み、ネットは除く')
  })

  it('参考値の説明を出す', () => {
    expect(html).toContain(`${MIN_SAMPLE} 本未満の参考値`)
  })
})

describe('AnalysisScreen：試合とセット', () => {
  it('試合を選ぶと、セット別の結果の表を出す（セットの行をタップできる）', () => {
    const html = renderToString(<AnalysisScreen data={data} initialScope={{ kind: 'match', matchId: 'm1' }} />)
    expect(html).toContain('セット別の結果')
    expect(html).toContain('第1セット')
    expect(html).toContain('1-0')
    expect(html).toContain('ミス数')
  })

  it('セットを選ぶと、得点の推移を出す', () => {
    const html = renderToString(<AnalysisScreen data={data} initialScope={{ kind: 'set', setId: 's1' }} />)
    expect(html).toContain('得点の推移')
    expect(html).toContain('1点目')
    expect(html).toContain('7 渡辺 サービスエース')
    expect(html).not.toContain('セット別の結果')
  })

  it('開く試合を指定できる（先頭の試合ではなく、渡した試合のセットを出す）', () => {
    const two: AnalysisData = {
      ...data,
      matches: [
        ...data.matches,
        { id: 'm2', teamId: 't', kind: 'match', opponentId: 'o1', date: '2026-10-25', tournament: null, setPoints: 25 },
      ],
      gameSets: [...data.gameSets, { id: 's9', matchId: 'm2', setNo: 1, ourScore: 11, oppScore: 25 }],
    }
    const html = renderToString(<AnalysisScreen data={two} initialScope={{ kind: 'match', matchId: 'm2' }} />)
    expect(html).toContain('11-25')
    expect(html).not.toContain('>1-0<')
  })

  it('記録のないセットを選んでも、得点の推移の欄と「記録がありません」を出す', () => {
    const none: AnalysisData = {
      ...data,
      gameSets: [...data.gameSets, { id: 's2', matchId: 'm1', setNo: 2, ourScore: 0, oppScore: 0 }],
    }
    const html = renderToString(<AnalysisScreen data={none} initialScope={{ kind: 'set', setId: 's2' }} />)
    expect(html).toContain('得点の推移')
    expect(html).toContain('得点の記録がありません')
  })

  it('範囲ごとに「選べるものがない」の文言を変える', () => {
    const noOpp: AnalysisData = { ...data, opponents: [], matches: data.matches.map((m) => ({ ...m, opponentId: null })) }
    expect(renderToString(<AnalysisScreen data={noOpp} initialScope={{ kind: 'opponent', opponentId: '' }} />)).toContain('選べる相手がありません')
    const empty: AnalysisData = { ...data, matches: [], gameSets: [] }
    expect(renderToString(<AnalysisScreen data={empty} initialScope={{ kind: 'match', matchId: '' }} />)).toContain('選べる試合がありません')
    expect(renderToString(<AnalysisScreen data={empty} initialScope={{ kind: 'set', setId: '' }} />)).toContain('選べるセットがありません')
  })

  it('全体では、セット別の結果も得点の推移も出さない', () => {
    const html = renderToString(<AnalysisScreen data={data} />)
    expect(html).not.toContain('セット別の結果')
    expect(html).not.toContain('得点の推移')
  })
})

describe('AnalysisScreen の AI コメント（T-32）', () => {
  const aiReports = {
    request: () => Promise.reject(new Error('使わない')),
    latest: () => Promise.resolve(null),
  }

  it('ai を渡したときだけ、AI コメントの欄を出す', () => {
    expect(renderToString(<AnalysisScreen data={data} />)).not.toContain('AIコメント')
    const html = renderToString(<AnalysisScreen data={data} ai={{ teamId: 't', aiReports }} />)
    expect(html).toContain('AIに分析してもらう')
  })

  it('練習の範囲では、ボタンを出さない', () => {
    const practice: AnalysisData = {
      ...data,
      matches: [{ ...data.matches[0]!, id: 'mp', kind: 'practice', opponentId: null }],
      gameSets: [{ id: 's1', matchId: 'mp', setNo: 1, ourScore: 0, oppScore: 0 }],
    }
    const html = renderToString(
      <AnalysisScreen data={practice} initialScope={{ kind: 'practice' }} ai={{ teamId: 't', aiReports }} />,
    )
    expect(html).toContain('練習はAIコメントの対象外です')
    expect(html).not.toContain('AIに分析してもらう')
  })
})

describe('AnalysisScreen（範囲「練習」：紅白戦をメインに、サーブ練習は別の表）', () => {
  const sv = (id: string, setId: string, o: object) => ({
    kind: 'serve' as const,
    clientId: id,
    setId,
    serverId: 'p7',
    serveType: 'float' as const,
    fromX: 0.5,
    toX: 0.1,
    toY: 0.1,
    result: 'ace' as const,
    missType: null,
    reception: null,
    receiverId: null,
    targetZone: null,
    recordedAt: '2026-11-05T00:00:00Z',
    ...o,
  })
  const practiceData: AnalysisData = {
    ...data,
    matches: [
      ...data.matches,
      { id: 'sc', teamId: 't', kind: 'scrimmage', opponentId: 'b1', date: '2026-11-05', tournament: null, setPoints: 25 },
      { id: 'pr', teamId: 't', kind: 'practice', opponentId: null, date: '2026-11-04', tournament: null, setPoints: 25 },
    ],
    gameSets: [
      ...data.gameSets,
      { id: 's5', matchId: 'sc', setNo: 1, ourScore: 0, oppScore: 0 },
      { id: 's6', matchId: 'pr', setNo: 1, ourScore: 0, oppScore: 0 },
    ],
    records: [
      ...data.records,
      { setId: 's5', serves: [sv('x1', 's5', {}), sv('x2', 's5', { result: 'miss', missType: 'net' })], receptions: [], attacks: [], points: [] },
      { setId: 's6', serves: [sv('y1', 's6', { result: 'in', targetZone: 1 })], receptions: [], attacks: [], points: [] },
    ],
  }
  const html = renderToString(<AnalysisScreen data={practiceData} initialScope={{ kind: 'practice' }} />)

  it('紅白戦を試合と同じ指標（サーブ効果率）で出し、サーブ練習を別の見出しで出す', () => {
    expect(html).toContain('紅白戦')
    expect(html).toContain('サーブ効果率')
    expect(html).toContain('サーブ練習')
    expect(html).toContain('ゾーン的中率')
    // 紅白戦：エース1・ミス1 の2本 →（100 − 25）÷ 2 = 37.5%
    expect(html).toContain('37.5%*')
  })
  it('Bチームの成績の入り方を注で伝える', () => {
    expect(html).toContain('Aチーム側とBチーム側の記録を、その部員の成績として集計')
  })
  describe('Bチームの部員（opponentPlayers で部員と結ぶ）', () => {
    // 紅白戦 s5：Aのサーブ 2 本（エース・ミス）に加えて、相手サーバー b7（＝部員 p7）のサーブをAが受けた記録（被エース）1 本
    // 部員 p7 のサーブ：エース2・ミス1 の 3 本 →（200 − 25）÷ 3 ≒ 58.3%
    const withB: AnalysisData = {
      ...practiceData,
      opponentPlayers: [{ id: 'b7', opponentId: 'b1', number: 7, playerId: 'p7' }],
      records: practiceData.records.map((r) =>
        r.setId === 's5'
          ? {
              ...r,
              receptions: [
                {
                  kind: 'reception' as const,
                  clientId: 'rb1',
                  setId: 's5',
                  receiverId: 'p7',
                  oppServerId: 'b7',
                  oppServeType: null,
                  atX: null,
                  atY: null,
                  result: 'ace' as const,
                  recordedAt: '2026-11-05T00:00:00Z',
                },
              ],
            }
          : r,
      ),
    }
    it('Bチームのサーブを、その部員のサーブに足す', () => {
      const out = renderToString(<AnalysisScreen data={withB} initialScope={{ kind: 'practice' }} />)
      expect(out).toContain('58.3%*')
      // エース率：3 本中エース 2 本 ≒ 66.7%
      expect(out).toContain('66.7%*')
    })
    it('opponentPlayers がなければ、Aチーム側だけ', () => {
      expect(html).toContain('37.5%*')
    })
  })
  it('試合の全体には、紅白戦もサーブ練習も入らない', () => {
    const all = renderToString(<AnalysisScreen data={practiceData} />)
    expect(all).not.toContain('サーブ練習')
    expect(all).toContain('100.0%*') // 試合 m1 のエース 1 本だけ
    expect(all).not.toContain('37.5%')
  })
})
