import { ZONES } from '../../contracts/index.ts'
import { formatZoneCell } from './format.ts'
import type { HeatCell, Heatmap as HeatmapView } from './view.ts'

const zoneClass = (c: HeatCell | undefined): string =>
  ['an-zone', c?.reference && 'an-ref', c?.negative && 'an-zone-neg'].filter(Boolean).join(' ')

/**
 * ゾーン別ヒートマップ。ゾーン番号と「値（本数）」を常に出す。
 * 向きは記録画面のコート図（components/Court.tsx）と同じ：相手コートはネットが下（奥の 1・6・5 が上）、
 * 自コートはネットが上（要件定義書 6 章「記録する側から見た並び」）
 */
export function Heatmap({ map }: { map: HeatmapView }) {
  const cells = new Map(map.cells.map((c) => [c.zone, c]))
  const { front, back } = ZONES[map.side]
  const netOnTop = map.side === 'own'
  const rows = netOnTop ? [front, back] : [back, front]
  const net = <div className="an-net">ネット</div>
  return (
    <figure className="an-heat" aria-label={`${map.metric}のゾーン別`}>
      <figcaption>ゾーン別 {map.metric}（本数）</figcaption>
      {netOnTop && net}
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
      {!netOnTop && net}
    </figure>
  )
}
