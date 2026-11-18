// グラフに渡す値を作る（要件定義書 F-12）。T-23。Chart.js には依存しない純粋な関数。
// 画面のコンポーネント（Chart.js）は、ここで作った値を描くだけにする。指標と集計は lib/stats、式はここに持たない。
// 数値の表示は 6 章「数値の表示」に合わせる：小数第1位の %、マイナスは「−」で色を変える、10 本未満の参考値は薄く「*」。
// values は丸めない % の数値。丸めは texts（目盛り・ツールチップの文字）を作るときだけ行う。
import type { Player, SetRecords } from '../../contracts/index.ts'
import {
  attackStatsByPlayer,
  receptionStatsByPlayer,
  serveStatsByPlayer,
} from '../../lib/stats/index.ts'
import { formatRate, isNegativeShown, isReference } from './format.ts'
import type { TrendRow } from './setResults.ts'
import { byNumber, playerLabel, type Tab } from './view.ts'

/** 棒グラフの1本の系列（例：サーブ効果率）。配列はすべて labels と同じ順 */
export interface ChartSeries {
  name: string
  /** % の数値。本数 0 は null（棒を描かない） */
  values: (number | null)[]
  /** 表示用の文字。例：`15.0%`、`−5.0%*` */
  texts: string[]
  /** 10 本未満の参考値。薄い色で描く */
  reference: boolean[]
  /** マイナスで表示する値。色を変える */
  negative: boolean[]
}

export interface PlayerBarChart {
  title: string
  /** 「7 渡辺」のように背番号と名前。背番号順 */
  labels: string[]
  series: ChartSeries[]
}

interface Entry {
  value: number | null
  count: number
}

function seriesOf(name: string, entries: readonly Entry[]): ChartSeries {
  return {
    name,
    values: entries.map((e) => e.value),
    texts: entries.map((e) => formatRate(e.value, e.count)),
    reference: entries.map((e) => e.value !== null && isReference(e.count)),
    negative: entries.map((e) => isNegativeShown(e.value)),
  }
}

/**
 * 選手別の棒グラフ（F-12）。サーブ＝サーブ効果率とミス率、レシーブ＝サーブレシーブ成功率、アタック＝アタック決定率。
 * 背番号順。その種類の記録がある選手だけ並べる
 */
export function playerBarChart(
  tab: Tab,
  sets: readonly SetRecords[],
  players: readonly Player[],
): PlayerBarChart {
  const byId = new Map(players.map((p) => [p.id, p]))
  const labelsOf = (ids: readonly string[]): string[] => ids.map((id) => playerLabel(byId.get(id)))
  const sorted = (ids: Iterable<string>): string[] => [...ids].sort(byNumber(players))

  switch (tab) {
    case 'serve': {
      const stats = serveStatsByPlayer(sets.flatMap((s) => s.serves))
      const ids = sorted(stats.keys())
      const rows = ids.flatMap((id) => {
        const s = stats.get(id)
        return s === undefined ? [] : [s]
      })
      return {
        title: '選手別 サーブ',
        labels: labelsOf(ids),
        series: [
          seriesOf('サーブ効果率', rows.map((s) => ({ value: s.efficiency, count: s.attempts }))),
          seriesOf('ミス率', rows.map((s) => ({ value: s.missRate, count: s.attempts }))),
        ],
      }
    }
    case 'reception': {
      const stats = receptionStatsByPlayer(sets.flatMap((s) => s.receptions))
      const ids = sorted(stats.keys())
      const rows = ids.flatMap((id) => {
        const s = stats.get(id)
        return s === undefined ? [] : [s]
      })
      return {
        title: '選手別 サーブレシーブ',
        labels: labelsOf(ids),
        series: [
          seriesOf(
            'サーブレシーブ成功率',
            rows.map((s) => ({ value: s.successRate, count: s.receptions })),
          ),
        ],
      }
    }
    case 'attack': {
      const stats = attackStatsByPlayer(sets.flatMap((s) => s.attacks))
      const ids = sorted(stats.keys())
      const rows = ids.flatMap((id) => {
        const s = stats.get(id)
        return s === undefined ? [] : [s]
      })
      return {
        title: '選手別 アタック',
        labels: labelsOf(ids),
        series: [
          seriesOf('アタック決定率', rows.map((s) => ({ value: s.killRate, count: s.attempts }))),
        ],
      }
    }
  }
}

export interface ScoreTrendChart {
  /** 横軸：何点目か。最初の「0」は 0-0 */
  labels: string[]
  /** 自チームの得点（labels と同じ順） */
  our: number[]
  /** 相手の得点 */
  opp: number[]
}

/** セット中の得点の推移の折れ線（F-12）。1点ずつ side を数えて、0-0 から始める */
export function scoreTrendChart(rows: readonly TrendRow[]): ScoreTrendChart {
  const labels = ['0']
  const our = [0]
  const opp = [0]
  for (const row of rows) {
    const o = our.at(-1) ?? 0
    const p = opp.at(-1) ?? 0
    labels.push(String(row.no))
    our.push(row.side === 'us' ? o + 1 : o)
    opp.push(row.side === 'opp' ? p + 1 : p)
  }
  return { labels, our, opp }
}
