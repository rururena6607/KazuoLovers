import { useEffect, useState } from 'react'
import type {
  PlayRecord,
  RecordRepository,
  SetRecords,
  Side,
} from '../../contracts/index.ts'
import { setWinner } from '../../lib/rally/index.ts'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_OPP_PLAYERS, DEMO_PLAYERS, DEMO_SETS } from './demo.ts'
import { describe, entriesOf, idsToRemove, renumberPoints, type Entry } from './history.ts'
import ReceptionPanel from './ReceptionPanel.tsx'
import RecordList from './RecordList.tsx'
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
  /** 練習モード（F-10）に切り替える */
  onPractice: () => void
}

const now = () => ({ clientId: crypto.randomUUID(), recordedAt: new Date().toISOString() })

export default function RecordScreen({ repo, pending, onPractice }: Props) {
  const [setIndex, setSetIndex] = useState(0)
  const [sets, setSets] = useState<SetRecords[]>([])
  const [override, setOverride] = useState<ServingOverride | null>(null)
  const [showList, setShowList] = useState(false)
  /** 取消・削除のたびに増やし、入力欄の「直前の1本」を消す */
  const [resetKey, setResetKey] = useState(0)

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

  /** 記録を消し、残りの得点の「そのあとの得点」を付け直す */
  const removeIds = (ids: readonly string[]) => {
    for (const id of ids) void repo.remove(id)
    const rest = points.filter((p) => !ids.includes(p.clientId))
    for (const p of renumberPoints(rest)) void repo.save(p)
  }

  const minus = (side: Side) => {
    const pt = lastPointOf(points, side)
    if (!pt) return
    // −1 ではサーブ権を変えない
    setOverride({ serving: state.serving, atPoints: points.length - 1 })
    removeIds([pt.clientId])
  }

  const entries = entriesOf(records)
  const lastEntry = entries.at(-1) ?? null

  /** 1本（または手動の得点）を消す。その1本の得点も消えて、サーブ権は残りの得点から決まる */
  const removeEntry = (entry: Entry) => {
    removeIds(idsToRemove(entry, points))
    setOverride(null)
    setResetKey((k) => k + 1)
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
        <button type="button" className="btn btn-sm" onClick={onPractice}>
          練習モード
        </button>
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

      {showList ? (
        <RecordList
          entries={entries}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onRemove={removeEntry}
          onEdit={(e) => void repo.save(e)}
          onClose={() => setShowList(false)}
        />
      ) : state.serving === 'us' ? (
        <ServePanel
          key={`${set.id}-${resetKey}`}
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={savePlay}
        />
      ) : (
        <ReceptionPanel
          key={`${set.id}-${resetKey}`}
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={savePlay}
        />
      )}

      <footer className="record-foot">
        <span className="num last-entry">
          {lastEntry ? describe(lastEntry, DEMO_PLAYERS, DEMO_OPP_PLAYERS) : '—'}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!lastEntry}
          onClick={() => lastEntry && removeEntry(lastEntry)}
        >
          取消
        </button>
        <button
          type="button"
          className="btn btn-sm"
          aria-pressed={showList}
          onClick={() => setShowList((v) => !v)}
        >
          一覧
        </button>
      </footer>
    </section>
  )
}
