import { ZONES } from '../../contracts/index.ts'
import { formatZoneCell } from './format.ts'
import type { HeatCell, Heatmap as HeatmapView } from './view.ts'

const zoneClass = (c: HeatCell | undefined): string =>
  ['an-zone', c?.reference && 'an-ref', c?.negative && 'an-zone-neg'].filter(Boolean).join(' ')

/** ゾーン別ヒートマップ。ネット側を上に、ゾーン番号と「値（本数）」を常に出す */
export function Heatmap({ map }: { map: HeatmapView }) {
  const cells = new Map(map.cells.map((c) => [c.zone, c]))
  const rows = [ZONES[map.side].front, ZONES[map.side].back]
  return (
    <figure className="an-heat" aria-label={`${map.metric}のゾーン別`}>
      <figcaption>ゾーン別 {map.metric}（本数）</figcaption>
      <div className="an-net">ネット</div>
      {rows.map((zones, i) => (
        <div className="an-heat-row" key={i}>
          {zones.map((zone) => {
            const c = cells.get(zone)
            return (
              <div key={zone} className={zoneClass(c)} style={{ ['--heat' as string]: c?.intensity ?? 0 }}>
                <span className="an-zone-no">{zone}</span>
                <span className="an-zone-val">{c?.text ?? formatZoneCell(null, 0)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </figure>
  )
}
