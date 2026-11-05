import { useState } from 'react'
import type { AnyRecord, RecordRepository, Side } from '../../contracts/index.ts'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_OPP_PLAYERS, DEMO_PLAYERS, DEMO_SETS } from './demo.ts'
import ServePanel from './ServePanel.tsx'

// 記録画面（要件定義書 6 章「画面の要素」）。試合とセットは管理画面（T-10）ができるまで demo.ts を使う。

interface Props {
  repo: RecordRepository
}

export default function RecordScreen({ repo }: Props) {
  const [serving, setServing] = useState<Side>('us')
  const [saveError, setSaveError] = useState<string | null>(null)
  // セットの切り替えは T-13 で入れる
  const set = DEMO_SETS[0]

  const save = (rec: AnyRecord) => {
    setSaveError(null)
    repo.save(rec).catch((e: unknown) => {
      console.error(e)
      setSaveError('保存できませんでした。もう一度押してください')
    })
  }

  return (
    <section className="record" aria-label={`${DEMO_MATCH.date} ${DEMO_OPPONENT.name}`}>
      <header className="record-head">
        <span>
          vs {DEMO_OPPONENT.name}・第{set.setNo}セット
        </span>
      </header>
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}

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

      {/* サーブ権を切り替えても入力途中の内容を残すため、どちらも描いたまま隠す */}
      <div hidden={serving !== 'us'}>
        <ServePanel
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={save}
        />
      </div>
      <div hidden={serving !== 'opp'}>
        <p className="placeholder">相手のサーブの記録は T-12 で作ります。</p>
      </div>
    </section>
  )
}
