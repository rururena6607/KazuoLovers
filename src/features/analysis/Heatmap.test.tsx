import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { Heatmap } from './Heatmap.tsx'
import type { Heatmap as HeatmapView } from './view.ts'

const map = (side: HeatmapView['side']): HeatmapView => ({
  side,
  metric: 'テスト',
  cells: [1, 2, 3, 4, 5, 6].map((zone) => ({
    zone,
    text: `${zone}`,
    count: 10,
    reference: false,
    negative: false,
    intensity: 0,
  })),
})

/** 上から下、左から右に読んだゾーン番号 */
const zoneOrder = (html: string): number[] =>
  [...html.matchAll(/class="an-zone-no">(\d)</g)].map((m) => Number(m[1]))

describe('Heatmap の向き（記録画面のコート図と同じ）', () => {
  it('相手コート：奥の 1・6・5 が上、ネット側の 2・3・4 が下。ネットの帯は下', () => {
    const html = renderToString(<Heatmap map={map('opponent')} />)
    expect(zoneOrder(html)).toEqual([1, 6, 5, 2, 3, 4])
    expect(html.indexOf('an-net')).toBeGreaterThan(html.lastIndexOf('an-zone-no'))
  })

  it('自コート：ネット側の 4・3・2 が上、奥の 5・6・1 が下。ネットの帯は上', () => {
    const html = renderToString(<Heatmap map={map('own')} />)
    expect(zoneOrder(html)).toEqual([4, 3, 2, 5, 6, 1])
    expect(html.indexOf('an-net')).toBeLessThan(html.indexOf('an-zone-no'))
  })
})
