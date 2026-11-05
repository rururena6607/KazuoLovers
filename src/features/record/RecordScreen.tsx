import { useCallback, useEffect, useState } from 'react'
import type { PlayRecord, RecordRepository, SetRecords, Side } from '../../contracts/index.ts'
import { toggleServing } from '../../lib/rally/index.ts'
import { DEMO_MATCH, DEMO_OPPONENT, DEMO_OPP_PLAYERS, DEMO_PLAYERS, DEMO_SETS } from './demo.ts'
import { describeEntry, entriesOf, idsToRemove, relinkAttacks, type Entry } from './history.ts'
import { newIds } from './ids.ts'
import { prevReceptionOf } from './attack.ts'
import RallyPanel from './RallyPanel.tsx'
import ReceptionPanel from './ReceptionPanel.tsx'
import RecordList from './RecordList.tsx'
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
  /** 練習モード（F-10）に切り替える */
  onPractice: () => void
}

const hasRecords = (r: SetRecords | undefined): boolean =>
  !!r && r.serves.length + r.receptions.length + r.attacks.length + r.points.length > 0

/** その1本を入力した欄（サーブ＝自チームのサーブ、レシーブ＝相手のサーブ） */
const panelOf = (rec: PlayRecord): Side | null =>
  rec.kind === 'serve' ? 'us' : rec.kind === 'reception' ? 'opp' : null

/** 付け足しができる1本か（サーブは A〜D のときだけ受けた相手を付け足せる） */
const canAttach = (rec: PlayRecord): boolean =>
  rec.kind === 'reception' || (rec.kind === 'serve' && rec.result === 'in')

export default function RecordScreen({ repo, onPractice }: Props) {
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
  const [showList, setShowList] = useState(false)
  /** 取消・削除した clientId。入力欄の「直前の1本」が消えたら付け足しをやめる */
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  /** ラリー中に出す入力：アタック（T-40）か、直前のサーブ・レシーブへの付け足し */
  const [rallyTab, setRallyTab] = useState<'attack' | 'serve'>('attack')

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
  const rally = inRally(lastPlay, points)
  const showAttack = rally && rallyTab === 'attack' && !showList

  const savePlay = (rec: PlayRecord) => {
    setSaveError(null)
    const isNew = !plays.some((p) => p.clientId === rec.clientId)
    save(rec)
    if (rec.kind !== 'attack') setLastSaved(rec)
    // 付け足し（同じ clientId の上書き）では得点を足さない（−1 で消した得点が戻らないように）
    if (!isNew) return
    // state・plays は保存した記録を通知を待たずに重ねたもの（useMatchRecords）なので、続けて押しても古くならない
    const pt = autoPoint(rec, state, points, newIds())
    if (pt) save(pt)
    setView(null)
    // 新しいサーブ・レシーブのあとにラリーになったら、まずアタックの入力を出す
    if (rec.kind !== 'attack') setRallyTab('attack')
  }

  const plus = (side: Side) => {
    setSaveError(null)
    save(makePoint(state, side, 'manual', null, { ...newIds(), setId: set.id }))
    setView(null)
  }

  /** 記録を消す。消したレシーブの直後のアタックの prevReception も付け直す */
  const removeIds = (ids: readonly string[]) => {
    for (const id of ids) remove(id)
    setRemoved((r) => new Set([...r, ...ids]))
    for (const a of relinkAttacks(plays.filter((p) => !ids.includes(p.clientId)))) save(a)
    // 得点が減ったときだけ、手動のサーブ権の切替をやめる（残りの得点から決める）
    if (points.some((p) => ids.includes(p.clientId))) setOverride(null)
  }

  const minus = (side: Side) => {
    const pt = lastPointOf(points, side)
    if (!pt) return
    // 自動の得点なら元の1本（エース・ミスなど）も消す。得点だけ消すと集計にエースが残る
    const source = plays.find((p) => p.clientId === pt.sourceId)
    const ids = source ? idsToRemove(source, points) : [pt.clientId]
    removeIds(ids)
    // −1 ではサーブ権を変えない
    const rest = points.filter((p) => !ids.includes(p.clientId)).length
    setOverride({ setId: set.id, serving: state.serving, atPoints: rest })
  }

  const entries = entriesOf(records)
  const lastEntry = entries.at(-1) ?? null

  /** 1本（または手動の得点）を消す。その1本の得点も消えて、サーブ権は残りの得点から決まる */
  const removeEntry = (entry: Entry) => removeIds(idsToRemove(entry, points))

  /** 評価の修正。直後のアタックの prevReception も付け直す */
  const editEntry = (entry: Entry) => {
    save(entry)
    if (entry.kind === 'point') return
    for (const a of relinkAttacks(plays.map((p) => (p.clientId === entry.clientId ? entry : p)))) save(a)
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
    lastSaved && lastSaved.setId === set.id && !removed.has(lastSaved.clientId) && canAttach(lastSaved)
      ? panelOf(lastSaved)
      : null

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

      {rally && !showList && (
        <>
          <p className="rally-hint">ラリー中：アタックを記録するか、得点したチームの数字をタップ</p>
          <div className="row seg" role="group" aria-label="ラリー中の入力">
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={rallyTab === 'attack'}
              onClick={() => setRallyTab('attack')}
            >
              アタック
            </button>
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={rallyTab === 'serve'}
              onClick={() => setRallyTab('serve')}
            >
              {shown === 'us' ? 'サーブ' : 'レシーブ'}（付け足し）
            </button>
          </div>
        </>
      )}

      {!showList &&
        !showAttack &&
        (view !== null ? (
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
        ))}

      {showList && (
        <RecordList
          entries={entries}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onRemove={removeEntry}
          onEdit={editEntry}
          onClose={() => setShowList(false)}
        />
      )}

      {/* 入力欄はどれも描いたまま隠し、一覧や付け足しに切り替えても入力途中の内容と直前の1本を残す */}
      {rally && (
        <div hidden={!showAttack}>
          <RallyPanel
            key={set.id}
            setId={set.id}
            players={DEMO_PLAYERS}
            prevReception={prevReceptionOf(lastPlay)}
            onSave={savePlay}
          />
        </div>
      )}
      <div hidden={showList || showAttack || shown !== 'us'}>
        <ServePanel
          key={set.id}
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={savePlay}
          removed={removed}
        />
      </div>
      <div hidden={showList || showAttack || shown !== 'opp'}>
        <ReceptionPanel
          key={set.id}
          setId={set.id}
          players={DEMO_PLAYERS}
          oppPlayers={DEMO_OPP_PLAYERS}
          onSave={savePlay}
          removed={removed}
        />
      </div>

      <footer className="record-foot">
        <span className="num last-entry">
          {lastEntry ? describeEntry(lastEntry, DEMO_PLAYERS, DEMO_OPP_PLAYERS) : '—'}
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
