import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  MatchContext,
  OpponentPlayer,
  PlayRecord,
  RecordRepository,
  SetRecords,
  Side,
} from '../../contracts/index.ts'
import { playerColorMap } from '../../components/playerColors.ts'
import { toggleServing } from '../../lib/rally/index.ts'
import { loadBestOf, saveBestOf, type BestOf } from './bestOf.ts'
import { describeEntry, entriesOf, idsToRemove, relinkAttacks, type Entry } from './history.ts'
import { newIds } from './ids.ts'
import { prevReceptionOf, rallyTurnOf } from './attack.ts'
import DigPanel from './DigPanel.tsx'
import RallyPanel from './RallyPanel.tsx'
import { recentServeMarks } from './recentMarks.ts'
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

// 記録画面（要件定義書 6 章「画面の要素」）。管理画面で選んだ試合（ctx）を記録する。

interface Props {
  repo: RecordRepository
  /** 開いている試合。セット・相手の背番号が増えたら親が作り直して渡す */
  ctx: MatchContext
  /** 次のセットを作る（F-05）。終わったら親が ctx を読み直す */
  onNextSet: () => Promise<void>
  /** 相手の背番号をその場で足す（F-04） */
  onAddOpp?: (number: number) => Promise<OpponentPlayer>
  /** 練習モード（F-10）に切り替える。なければボタンを出さない */
  onPractice?: () => void
}

/** ラリー中に開いている入力：自チームのアタック・相手のスパイク（F-25）・直前の1本への付け足し。null は閉じている */
type RallyTab = 'attack' | 'dig' | 'serve' | null

const hasRecords = (r: SetRecords | undefined): boolean =>
  !!r &&
  r.serves.length + r.receptions.length + r.attacks.length + (r.oppAttacks?.length ?? 0) + r.points.length > 0

/** その1本を入力した欄（サーブ＝自チームのサーブ、レシーブ＝相手のサーブ） */
const panelOf = (rec: PlayRecord): Side | null =>
  rec.kind === 'serve' ? 'us' : rec.kind === 'reception' ? 'opp' : null

/** 付け足しができる1本か（サーブは A〜D のときだけ受けた相手を付け足せる） */
const canAttach = (rec: PlayRecord): boolean =>
  rec.kind === 'reception' || (rec.kind === 'serve' && rec.result === 'in')

export default function RecordScreen({ repo, ctx, onNextSet, onAddOpp, onPractice }: Props) {
  const { match, opponent } = ctx
  const [saveError, setSaveError] = useState<string | null>(null)
  const onError = useCallback((e: unknown) => {
    console.error(e)
    setSaveError('保存できませんでした。もう一度押してください')
  }, [])
  const { sets, save, remove } = useMatchRecords(repo, match.id, onError)

  /** 何セットマッチか。最終セットの点数と試合の終わりを決める（bestOf.ts） */
  const [bestOf, setBestOf] = useState<BestOf>(() => loadBestOf(match.id))
  const changeBestOf = (b: BestOf) => {
    setBestOf(b)
    saveBestOf(match.id, b)
  }
  const [creatingSet, setCreatingSet] = useState(false)

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
  /**
   * ラリー中に開いた入力：アタック（T-40）か、直前のサーブ・レシーブへの付け足し。null なら閉じている。
   * どの1本のあとに開いたか（after）も持ち、次の1本が入ったら初めの状態（相手の番なら閉じる）に戻す
   */
  const [rallyChoice, setRallyChoice] = useState<{ after: string; tab: RallyTab } | null>(null)

  const recordsOf = (setId: string) => sets.find((s) => s.setId === setId)
  // いまのセットは記録から決める（記録がある最後のセット）。画面を開き直しても第1セットに戻らない
  let setIndex = Math.min(advancedTo, ctx.sets.length - 1)
  ctx.sets.forEach((s, i) => {
    if (i > setIndex && hasRecords(recordsOf(s.id))) setIndex = i
  })
  // 管理画面は試合を作るときに第1セットも作るので、ふつうは空にならない
  const set = ctx.sets[setIndex] ?? ctx.sets[0] ?? { id: '', matchId: match.id, setNo: 1, ourScore: 0, oppScore: 0 }
  const oppName = opponent?.name ?? '相手'
  /** 選ぶときは今いる選手だけ。表示（一覧・直前の1本）は引退した選手も含める */
  const activePlayers = ctx.players.filter((p) => p.active)
  const oppPlayers = ctx.opponentPlayers
  /** 選手ごとの色（F-22）。引退した選手も含めて決めるので、分析画面と同じ色になる */
  const colors = useMemo(() => playerColorMap(ctx.players), [ctx.players])

  const records = recordsOf(set.id)
  /** このセットの直前のサーブの着弾点（F-22「記録画面は直前の数本」） */
  const recentMarks = recentServeMarks(records?.serves ?? [], ctx.players, colors)
  const points = records?.points ?? []
  const plays: PlayRecord[] = records
    ? [...records.serves, ...records.receptions, ...records.attacks, ...(records.oppAttacks ?? [])]
    : []
  const state = rallyStateOf(points, override?.setId === set.id ? override : null)
  const winners = setWinnersOf(
    ctx.sets.map((s) => recordsOf(s.id)?.points ?? []),
    bestOf,
    match.setPoints,
  )
  const winner = winners[setIndex] ?? null
  const matchOver = matchWinner(winners, bestOf) !== null
  const lastPlay = records
    ? latestOf<PlayRecord>(records.serves, records.receptions, records.attacks, records.oppAttacks ?? [])
    : null
  const shown = view ?? state.serving
  const rally = inRally(lastPlay, points)
  /**
   * 相手が打ってくる番か。自チームのサーブのあとはアタック欄を閉じておき（部活フィードバック）、
   * 代わりに相手のスパイクの欄（F-25）を開く。拾ったら（A〜D）自チームの番になりアタック欄が開く
   */
  const turn = rallyTurnOf(lastPlay)
  const rallyTab: RallyTab =
    lastPlay && rallyChoice?.after === lastPlay.clientId
      ? rallyChoice.tab
      : turn === 'us'
        ? 'attack'
        : 'dig'
  /** 押したタブを開く。開いているタブを押し直したら閉じる */
  const openRallyTab = (tab: Exclude<RallyTab, null>) => {
    if (lastPlay) setRallyChoice({ after: lastPlay.clientId, tab: tab === rallyTab ? null : tab })
  }
  const showAttack = rally && rallyTab === 'attack' && !showList
  const showDig = rally && rallyTab === 'dig' && !showList
  /** ラリー中の欄（アタック・相手のスパイク）を出しているあいだは、サーブ・レシーブの欄を隠す */
  const showRallyInput = showAttack || showDig

  const savePlay = (rec: PlayRecord) => {
    setSaveError(null)
    const isNew = !plays.some((p) => p.clientId === rec.clientId)
    save(rec)
    if (rec.kind !== 'attack') setLastSaved(rec)
    // 付け足し（同じ clientId の上書き）では得点を足さない（−1 で消した得点が戻らないように）
    if (!isNew) return
    // state・plays は保存した記録を通知を待たずに重ねたもの（useMatchRecords）なので、続けて押しても古くならない
    const pt = autoPoint(rec, state, points, newIds())
    // セットが終わったあとは得点を足さない（26-23 を作らない。lib/rally の applyPointInSet と同じ考え）
    if (pt && !winner) save(pt)
    setView(null)
  }

  const plus = (side: Side) => {
    if (winner) return
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

  const goToSet = (index: number) => {
    setAdvancedTo(index)
    setOverride(null)
    setView(null)
    setLastSaved(null)
  }

  /** 次のセットがまだなければ作ってから進む */
  const nextSet = () => {
    const index = setIndex + 1
    if (index < ctx.sets.length) {
      goToSet(index)
      return
    }
    setCreatingSet(true)
    setSaveError(null)
    onNextSet()
      .then(() => goToSet(index))
      .catch((e: unknown) => {
        console.error(e)
        setSaveError('次のセットを作れませんでした。電波を確かめて、もう一度押してください')
      })
      .finally(() => setCreatingSet(false))
  }

  // サーブ権が移って入力欄が替わっても、直前の1本に付け足せるようにする
  const attachSide =
    lastSaved && lastSaved.setId === set.id && !removed.has(lastSaved.clientId) && canAttach(lastSaved)
      ? panelOf(lastSaved)
      : null

  return (
    <section className="record" aria-label={`${match.date} ${oppName}`}>
      {/* 得点・サーブ権・ラリー中の案内。iPad の横向きでは左の列に出す */}
      <div className="record-side">
        <header className="record-head">
          <span>
            vs {oppName}・第{set.setNo}セット
          </span>
          <button
            type="button"
            className="btn btn-sm"
            aria-label={`${bestOf}セットマッチ（押すと${bestOf === 3 ? 5 : 3}セットマッチに変える）`}
            onClick={() => changeBestOf(bestOf === 3 ? 5 : 3)}
          >
            {bestOf}セットマッチ
          </button>
          {pending > 0 && (
            <span className="pending">
              未送信 {pending}件
              <button type="button" className="btn btn-sm" onClick={() => void repo.retry()}>
                再送
              </button>
            </span>
          )}
          {onPractice && (
            <button type="button" className="btn btn-sm" onClick={onPractice}>
              練習モード
            </button>
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
            label={oppName}
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
            {!matchOver && setIndex < bestOf - 1 && (
              <button type="button" className="btn" disabled={creatingSet} onClick={nextSet}>
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
            <p className={turn === 'us' ? 'rally-hint' : 'rally-hint is-opp'}>
              {turn === 'us'
                ? 'ラリー中（自チームの攻撃）：アタックを記録するか、得点したチームの数字をタップ'
                : 'ラリー中（相手の攻撃）：相手のスパイクを記録するか、得点したチームの数字をタップ'}
            </p>
            <div className="row seg" role="group" aria-label="ラリー中の入力">
              <button
                type="button"
                className="btn btn-sm"
                aria-pressed={rallyTab === 'attack'}
                onClick={() => openRallyTab('attack')}
              >
                自チームのアタック
              </button>
              <button
                type="button"
                className="btn btn-sm"
                aria-pressed={rallyTab === 'dig'}
                onClick={() => openRallyTab('dig')}
              >
                相手のスパイク
              </button>
              <button
                type="button"
                className="btn btn-sm"
                aria-pressed={rallyTab === 'serve'}
                onClick={() => openRallyTab('serve')}
              >
                {shown === 'us' ? 'サーブ' : 'レシーブ'}（付け足し）
              </button>
            </div>
          </>
        )}

        {!showList &&
          !showRallyInput &&
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

      </div>
      {/* 入力欄。iPad の横向きでは右の列に出す */}
      <div className="record-input">
        {showList && (
          <RecordList
            entries={entries}
            players={ctx.players}
            oppPlayers={oppPlayers}
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
              players={activePlayers}
              prevReception={prevReceptionOf(lastPlay)}
              onSave={savePlay}
            />
          </div>
        )}
        {rally && (
          <div hidden={!showDig}>
            <DigPanel
              key={set.id}
              setId={set.id}
              players={activePlayers}
              oppPlayers={oppPlayers}
              onSave={savePlay}
              onAddOpp={onAddOpp}
            />
          </div>
        )}
        <div hidden={showList || showRallyInput || shown !== 'us'}>
          <ServePanel
            key={set.id}
            setId={set.id}
            players={activePlayers}
            oppPlayers={oppPlayers}
            onSave={savePlay}
            removed={removed}
            onAddOpp={onAddOpp}
            recentMarks={recentMarks}
          />
        </div>
        <div hidden={showList || showRallyInput || shown !== 'opp'}>
          <ReceptionPanel
            key={set.id}
            setId={set.id}
            players={activePlayers}
            oppPlayers={oppPlayers}
            onSave={savePlay}
            removed={removed}
            onAddOpp={onAddOpp}
          />
        </div>

      </div>
      <footer className="record-foot">
        <span className="num last-entry">
          {lastEntry ? describeEntry(lastEntry, ctx.players, oppPlayers) : '—'}
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
