import { useEffect, useState } from 'react'
import type { MatchContext, MatchRepository, RecordRepository } from '../../contracts/index.ts'
import PracticeScreen from '../practice/PracticeScreen.tsx'
import { withOppPlayer, withSavedSet, withSet } from './matchSource.ts'
import RecordScreen from './RecordScreen.tsx'

// 記録のタブ：選んだ試合を読み、試合なら記録画面、練習（kind が practice）なら練習モードを出す。
// セットや相手の背番号を足したら、読み直さずに手元の ctx に足す（電波が弱くても待たない）。

interface Props {
  repo: RecordRepository
  source: MatchRepository
  /** 開く試合。null ならまだ選んでいない */
  matchId: string | null
  /** 試合を選びに行く（管理のタブ） */
  onChooseMatch: () => void
  /** 記録画面の「練習モード」。なければボタンを出さない */
  onPractice?: () => void
  /** 練習モードを閉じる */
  onExitPractice: () => void
  exitPracticeLabel: string
}

type Loaded = { matchId: string; ctx: MatchContext } | { matchId: string; error: string }

export default function RecordTab({
  repo,
  source,
  matchId,
  onChooseMatch,
  onPractice,
  onExitPractice,
  exitPracticeLabel,
}: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (matchId === null) return
    let alive = true
    source
      .loadMatch(matchId)
      .then((ctx) => alive && setLoaded({ matchId, ctx }))
      .catch((e: unknown) => {
        console.error(e)
        if (alive) setLoaded({ matchId, error: '試合を読めませんでした。電波を確かめてください' })
      })
    return () => {
      alive = false
    }
  }, [source, matchId, retry])

  if (matchId === null) {
    return (
      <section className="placeholder">
        <h1>記録</h1>
        <p>まだ試合を選んでいません。管理のタブで試合（または練習）を作るか選んでください。</p>
        <button type="button" className="btn" onClick={onChooseMatch}>
          試合を選ぶ
        </button>
      </section>
    )
  }

  // 別の試合を選んだ直後は、前の試合を出さない
  const current = loaded?.matchId === matchId ? loaded : null
  if (current === null) {
    return (
      <section className="placeholder" aria-busy="true">
        <p>試合を読んでいます…</p>
      </section>
    )
  }
  if ('error' in current) {
    return (
      <section className="placeholder">
        <p className="error" role="alert">
          {current.error}
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>
            もう一度読む
          </button>
          <button type="button" className="btn" onClick={onChooseMatch}>
            試合を選び直す
          </button>
        </div>
      </section>
    )
  }

  const { ctx } = current
  const update = (f: (c: MatchContext) => MatchContext) =>
    setLoaded((l) => (l && 'ctx' in l && l.matchId === matchId ? { matchId, ctx: f(l.ctx) } : l))

  if (ctx.match.kind === 'practice') {
    return (
      <PracticeScreen
        key={ctx.match.id}
        repo={repo}
        ctx={ctx}
        onExit={onExitPractice}
        exitLabel={exitPracticeLabel}
      />
    )
  }

  const opponent = ctx.opponent
  const onAddOpp = opponent
    ? (n: number) =>
        source.addOpponentPlayer(opponent.id, n).then((p) => {
          update((c) => ({ ...c, opponentPlayers: withOppPlayer(c.opponentPlayers, p) }))
          return p
        })
    : undefined

  const onNextSet = () =>
    source.createNextSet(ctx.match.id).then((s) => {
      update((c) => ({ ...c, sets: withSet(c.sets, s) }))
    })

  /** 動かした列の境目を保存し（MatchRepository.updateColSplits、#63）、保存したセットで手元の ctx を置き換える（F-24） */
  const onSaveColSplits = (setId: string, [a, b]: readonly [number, number]) =>
    source.updateColSplits(setId, a, b).then((s) => {
      update((c) => ({ ...c, sets: withSavedSet(c.sets, s) }))
    })

  return (
    <RecordScreen
      key={ctx.match.id}
      repo={repo}
      ctx={ctx}
      onNextSet={onNextSet}
      onAddOpp={onAddOpp}
      onPractice={onPractice}
      onSaveColSplits={onSaveColSplits}
    />
  )
}
