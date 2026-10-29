import { ZONES } from '../../contracts/index.ts'
import type { Heatmap as HeatmapView } from './view.ts'

/** ゾーン別ヒートマップ。ネット側を上に、ゾーン番号と「値（本数）」を常に出す */
export function Heatmap({ map }: { map: HeatmapView }) {
  const cellOf = (zone: number) => map.cells.find((c) => c.zone === zone)
  const rows = [ZONES[map.side].front, ZONES[map.side].back]
  return (
    <figure className="an-heat" aria-label={`${map.metric}のゾーン別`}>
      <figcaption>ゾーン別 {map.metric}（本数）</figcaption>
      <div className="an-net">ネット</div>
      {rows.map((zones, i) => (
        <div className="an-heat-row" key={i}>
          {zones.map((zone) => {
            const c = cellOf(zone)
            return (
              <div
                key={zone}
                className={c?.reference ? 'an-zone an-ref' : 'an-zone'}
                style={{ ['--heat' as string]: c?.intensity ?? 0 }}
              >
                <span className="an-zone-no">{zone}</span>
                <span className="an-zone-val">{c?.text ?? '−（0）'}</span>
              </div>
            )
          })}
        </div>
      ))}
    </figure>
  )
}
