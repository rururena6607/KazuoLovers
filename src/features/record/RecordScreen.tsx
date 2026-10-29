import { useEffect, useState } from 'react'
import type {
  PlayRecord,
  RecordRepository,
  SetRecords,
  Side,
} from '../../contracts/index.ts'
import { setWinner } from '../../lib/rally/index.ts'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_OPP_PLAYERS, DEMO_PLAYERS, DEMO_SETS } from './demo.ts'
import ReceptionPanel from './ReceptionPanel.tsx'
import ScoreButton from './ScoreButton.tsx'
import {
  autoPoint,
  inRally,
  lastPointOf,
  makePoint,
  rallyStateOf,
  setPointsOf,
  type ServingOverride,
} from './score.ts'
import ServePanel from './ServePanel.tsx'

// 記録画面（要件定義書 6 章「画面の要素」）。試合とセットは管理画面（T-10）ができるまで demo.ts を使う。

interface Props {
  repo: RecordRepository
  /** 未送信の件数（F-17） */
  pending: number
}

const now = () => ({ clientId: crypto.randomUUID(), recordedAt: new Date().toISOString() })

export default function RecordScreen({ repo, pending }: Props) {
  const [setIndex, setSetIndex] = useState(0)
  const [sets, setSets] = useState<SetRecords[]>([])
  const [override, setOverride] = useState<ServingOverride | null>(null)

  useEffect(() => repo.subscribe(DEMO_MATCH.id, setSets), [repo])

  const set = DEMO_SETS[setIndex]
  if (!set) return null
  const records = sets.find((s) => s.setId === set.id)
  const points = records?.points ?? []
  const plays: PlayRecord[] = records
    ? [...records.serves, ...records.receptions, ...records.attacks]
    : []
  const state = rallyStateOf(points, override)
  const winner = setWinner(state, setPointsOf(set.setNo, DEMO_MATCH.setPoints))
  const isLastSet = setIndex === DEMO_SETS.length - 1

  const savePlay = (rec: PlayRecord) => {
    void repo.save(rec)
    const pt = autoPoint(rec, state, points, now())
    if (pt) void repo.save(pt)
  }

  const plus = (side: Side) => {
    void repo.save(makePoint(state, side, 'manual', null, { ...now(), setId: set.id }))
  }

  const minus = (side: Side) => {
    const pt = lastPointOf(points, side)
    if (!pt) return
    // −1 ではサーブ権を変えない
    setOverride({ serving: state.serving, atPoints: points.length - 1 })
    void repo.remove(pt.clientId)
  }

  const switchServing = (side: Side) => setOverride({ serving: side, atPoints: points.length })

  const nextSet = () => {
    setSetIndex((i) => i + 1)
    setOverride(null)
  }

  return (
    <section className="record" aria-label={`${DEMO_MATCH.date} ${DEMO_OPPONENT.name}`}>
      <header className="record-head">
        <span>
          vs {DEMO_OPPONENT.name}・第{set.setNo}セット
        </span>
        {pending > 0 && (
          <span className="pending">
            未送信 {pending}件
            <button type="button" className="btn btn-sm" onClick={() => void repo.retry()}>
              再送
            </button>
          </span>
        )}
      </header>

      <div className="scoreboard">
        <ScoreButton
          label="自チーム"
          score={state.ourScore}
          serving={state.serving === 'us'}
          onPlus={() => plus('us')}
          onMinus={() => minus('us')}
        />
        <span className="score-sep">-</span>
        <ScoreButton
          label={DEMO_OPPONENT.name}
          score={state.oppScore}
          serving={state.serving === 'opp'}
          onPlus={() => plus('opp')}
          onMinus={() => minus('opp')}
        />
      </div>

      {winner && (
        <div className="banner set-over">
          <span>
            セット終了 {state.ourScore}-{state.oppScore}（{winner === 'us' ? '勝ち' : '負け'}）
          </span>
          {!isLastSet && (
            <button type="button" className="btn" onClick={nextSet}>
              次のセットへ
            </button>
          )}
        </div>
      )}

      <div className="row seg" role="group" aria-label="サーブ権">
        <button
          type="button"
          className="btn"
          aria-pressed={state.serving === 'us'}
          onClick={() => switchServing('us')}
        >
          自チームのサーブ
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={state.serving === 'opp'}
          onClick={() => switchServing('opp')}
        >
          相手のサーブ
        </button>
      </div>

      {inRally(plays, points) && (
        <p className="rally-hint">ラリー中：得点したチームの数字をタップ</p>
      )}

      {state.serving === 'us' ? (
        <ServePanel
          key={set.id}
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={savePlay}
        />
      ) : (
        <ReceptionPanel
          key={set.id}
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={savePlay}
        />
      )}
    </section>
  )
}
