import type { Cell, Metric, Table } from './view.ts'

const cellClass = (c: Cell) => ['an-num', c.reference && 'an-ref', c.negative && 'an-neg'].filter(Boolean).join(' ')

/** 全体指標。見出しの下に数字を大きく並べる */
export function MetricRow({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="an-metrics">
      {metrics.map((m) => (
        <div key={m.label} className="an-metric">
          <dt>{m.label}</dt>
          <dd className={cellClass(m.cell)}>{m.cell.text}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 選手別・サーブの種類別などの表 */
export function StatTable({ title, nameHeader, table }: { title: string; nameHeader: string; table: Table }) {
  return (
    <section className="an-section">
      <h3>{title}</h3>
      {table.rows.length === 0 ? (
        <p className="an-empty">記録がありません</p>
      ) : (
        <div className="an-scroll">
          <table className="an-table">
            <thead>
              <tr>
                <th scope="col">{nameHeader}</th>
                {table.columns.map((c) => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
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
