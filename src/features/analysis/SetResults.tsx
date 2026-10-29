import { cellClass } from './view.ts'
import type { SetResultTable, TrendRow } from './setResults.ts'

/** セット別の結果の表。セットの行をタップすると、そのセットの分析を開く */
export function SetResults({ table, onSelect }: { table: SetResultTable; onSelect: (setId: string) => void }) {
  return (
    <section className="an-section">
      <h3>セット別の結果</h3>
      {table.rows.length === 0 ? (
        <p className="an-empty">セットがありません</p>
      ) : (
        <div className="an-scroll">
          <table className="an-table">
            <thead>
              <tr>
                <th scope="col">セット</th>
                <th scope="col">得点</th>
                {table.columns.map((c) => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.setId}>
                  <th scope="row">
                    <button type="button" className="an-link" onClick={() => onSelect(row.setId)}>
                      {`第${row.setNo}セット`}
                    </button>
                  </th>
                  <td className={row.won === false ? 'an-num an-neg' : 'an-num'}>{row.score}</td>
                  {row.cells.map((c, i) => (
                    <td key={i} className={cellClass(c)}>
                      {c.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** セット中の得点の推移。何点目に、誰の何で得点・失点したか */
export function ScoreTrend({ rows }: { rows: TrendRow[] }) {
  return (
    <section className="an-section">
      <h3>得点の推移</h3>
      {rows.length === 0 ? (
        <p className="an-empty">得点の記録がありません</p>
      ) : (
        <ol className="an-trend">
          {rows.map((r) => (
            <li key={r.id} className={r.side === 'us' ? 'an-trend-us' : 'an-trend-opp'}>
              <span className="an-trend-no">{`${r.no}点目`}</span>
              <span className="an-num an-trend-score">{r.score}</span>
              <span>
                {`${r.side === 'us' ? '得点' : '失点'}：${r.text}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
