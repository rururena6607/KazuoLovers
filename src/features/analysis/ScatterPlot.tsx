import Court from '../../components/Court.tsx'
import type { Scatter } from './view.ts'

/**
 * 着弾点の散布図（F-22）。記録画面と同じコート図に、選手ごとの色の点を重ねる。
 * 色だけに頼らず、点の中に背番号を書き、下に色と「7 渡辺」の凡例を出す
 */
export function ScatterPlot({ scatter }: { scatter: Scatter }) {
  return (
    <figure className="an-scatter">
      <figcaption>着弾点の散布図（選手ごとの色）</figcaption>
      <Court side="opponent" marks={scatter.marks} label="着弾点の散布図（相手コート）" />
      {scatter.legend.length > 0 ? (
        <ul className="an-legend" aria-label="選手の色">
          {scatter.legend.map((l) => (
            <li key={l.id}>
              <span className="an-legend-dot" style={{ background: l.color }} aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="an-empty">着弾点を記録したサーブがありません</p>
      )}
    </figure>
  )
}
