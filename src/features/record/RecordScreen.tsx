import { useCallback, useEffect, useState } from 'react'
import type { PlayRecord, RecordRepository, SetRecords, Side } from '../../contracts/index.ts'
import { revertPoint, toggleServing } from '../../lib/rally/index.ts'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_OPP_PLAYERS, DEMO_PLAYERS, DEMO_SETS } from './demo.ts'
import { newIds } from './ids.ts'
import ReceptionPanel from './ReceptionPanel.tsx'
import ScoreButton from './ScoreButton.tsx'
import {
  autoPoint,
  inRally,
  lastPointOf,
  latestOf,
  makePoint,
  matchWinner,
  rallyStateOf,
  setWinnersOf,
  type ServingOverride,
} from './score.ts'
import ServePanel from './ServePanel.tsx'
import { useMatchRecords } from './useMatchRecords.ts'

// 記録画面（要件定義書 6 章「画面の要素」）。試合とセットは管理画面（T-10）ができるまで demo.ts を使う。

interface Props {
  repo: RecordRepository
}

const hasRecords = (r: SetRecords | undefined): boolean =>
  !!r && r.serves.length + r.receptions.length + r.attacks.length + r.points.length > 0

/** その1本を入力した欄（サーブ＝自チームのサーブ、レシーブ＝相手のサーブ） */
const panelOf = (rec: PlayRecord): Side | null =>
  rec.kind === 'serve' ? 'us' : rec.kind === 'reception' ? 'opp' : null

/** 付け足しができる1本か（サーブは A〜D のときだけ受けた相手を付け足せる） */
const canAttach = (rec: PlayRecord): boolean =>
  rec.kind === 'reception' || (rec.kind === 'serve' && rec.result === 'in')

export default function RecordScreen({ repo }: Props) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const onError = useCallback((e: unknown) => {
    console.error(e)
    setSaveError('保存できませんでした。もう一度押してください')
  }, [])
  const { sets, save, remove } = useMatchRecords(repo, DEMO_MATCH.id, onError)

  const [pending, setPending] = useState(0)
  useEffect(() => repo.subscribePending(setPending), [repo])

  /** 「次のセットへ」で進んだセット（まだ記録がないセットへ進むため） */
  const [advancedTo, setAdvancedTo] = useState(0)
  const [override, setOverride] = useState<(ServingOverride & { setId: string }) | null>(null)
  /** 直前の1本に付け足すために出している入力欄。null ならサーブ権の側 */
  const [view, setView] = useState<Side | null>(null)
  /** この画面で最後に保存した1本 */
  const [lastSaved, setLastSaved] = useState<PlayRecord | null>(null)

  const recordsOf = (setId: string) => sets.find((s) => s.setId === setId)
  // いまのセットは記録から決める（記録がある最後のセット）。画面を開き直しても第1セットに戻らない
  let setIndex = advancedTo
  DEMO_SETS.forEach((s, i) => {
    if (i > setIndex && hasRecords(recordsOf(s.id))) setIndex = i
  })
  const set = DEMO_SETS[setIndex] ?? DEMO_SETS[0]
  const totalSets = DEMO_SETS.length

  const records = recordsOf(set.id)
  const points = records?.points ?? []
  const plays: PlayRecord[] = records
    ? [...records.serves, ...records.receptions, ...records.attacks]
    : []
  const state = rallyStateOf(points, override?.setId === set.id ? override : null)
  const winners = setWinnersOf(
    DEMO_SETS.map((s) => recordsOf(s.id)?.points ?? []),
    totalSets,
    DEMO_MATCH.setPoints,
  )
  const winner = winners[setIndex] ?? null
  const matchOver = matchWinner(winners, totalSets) !== null
  const lastPlay = records ? latestOf<PlayRecord>(records.serves, records.receptions, records.attacks) : null
  const shown = view ?? state.serving

  const savePlay = (rec: PlayRecord) => {
    setSaveError(null)
    const isNew = !plays.some((p) => p.clientId === rec.clientId)
    save(rec)
    setLastSaved(rec)
    // 付け足し（同じ clientId の上書き）では得点を足さない（−1 で消した得点が戻らないように）
    if (!isNew) return
    const pt = autoPoint(rec, state, points, newIds())
    if (pt) save(pt)
    setView(null)
  }

  const plus = (side: Side) => {
    setSaveError(null)
    save(makePoint(state, side, 'manual', null, { ...newIds(), setId: set.id }))
    setView(null)
  }

  const minus = (side: Side) => {
    const pt = lastPointOf(points, side)
    if (!pt) return
    // −1 ではサーブ権を変えない
    setOverride({ setId: set.id, serving: revertPoint(state, side).serving, atPoints: points.length - 1 })
    remove(pt.clientId)
  }

  const switchServing = (side: Side) => {
    setView(null)
    if (side === state.serving) return
    setOverride({ setId: set.id, serving: toggleServing(state).serving, atPoints: points.length })
  }

  const nextSet = () => {
    setAdvancedTo(setIndex + 1)
    setOverride(null)
    setView(null)
    setLastSaved(null)
  }

  // サーブ権が移って入力欄が替わっても、直前の1本に付け足せるようにする
  const attachSide =
    lastSaved && lastSaved.setId === set.id && canAttach(lastSaved) ? panelOf(lastSaved) : null

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
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}

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
            {matchOver && '・試合終了'}
          </span>
          {!matchOver && setIndex < totalSets - 1 && (
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

      {inRally(lastPlay, points) && (
        <p className="rally-hint">ラリー中：得点したチームの数字をタップ</p>
      )}

      {view !== null ? (
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => setView(null)}>
            次の1本の入力に戻る
          </button>
        </div>
      ) : (
        attachSide !== null &&
        attachSide !== shown && (
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setView(attachSide)}>
              直前の1本（{attachSide === 'us' ? 'サーブ' : 'レシーブ'}）に付け足す
            </button>
          </div>
        )
      )}

      {/* 入力欄はどちらも描いたまま隠し、入力途中の内容と直前の1本を残す */}
      <div hidden={shown !== 'us'}>
        <ServePanel
          key={set.id}
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={savePlay}
        />
      </div>
      <div hidden={shown !== 'opp'}>
        <ReceptionPanel
          key={set.id}
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={savePlay}
        />
      </div>
    </section>
  )
}
