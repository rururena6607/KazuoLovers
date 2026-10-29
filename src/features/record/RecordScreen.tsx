import { useState } from 'react'
import type { RecordRepository, Side } from '../../contracts/index.ts'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_OPP_PLAYERS, DEMO_PLAYERS, DEMO_SETS } from './demo.ts'
import ServePanel from './ServePanel.tsx'

// 記録画面（要件定義書 6 章「画面の要素」）。試合とセットは管理画面（T-10）ができるまで demo.ts を使う。

interface Props {
  repo: RecordRepository
}

export default function RecordScreen({ repo }: Props) {
  const [setIndex] = useState(0)
  const [serving, setServing] = useState<Side>('us')
  const set = DEMO_SETS[setIndex] ?? DEMO_SETS[0]
  if (!set) return null

  const save = (rec: Parameters<RecordRepository['save']>[0]) => {
    void repo.save(rec)
  }

  return (
    <section className="record" aria-label={`${DEMO_MATCH.date} ${DEMO_OPPONENT.name}`}>
      <header className="record-head">
        <span>
          vs {DEMO_OPPONENT.name}・第{set.setNo}セット
        </span>
      </header>

      <div className="row seg" role="group" aria-label="サーブ権">
        <button
          type="button"
          className="btn"
          aria-pressed={serving === 'us'}
          onClick={() => setServing('us')}
        >
          自チームのサーブ
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={serving === 'opp'}
          onClick={() => setServing('opp')}
        >
          相手のサーブ
        </button>
      </div>

      {serving === 'us' ? (
        <ServePanel
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={save}
        />
      ) : (
        <p className="placeholder">相手のサーブの記録は T-12 で作ります。</p>
      )}
    </section>
  )
}
