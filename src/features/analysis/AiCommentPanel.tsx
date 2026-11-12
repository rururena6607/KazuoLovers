import { useEffect, useMemo, useState } from 'react'
import { zoneOf } from '../../lib/court/index.ts'
import type { AiComment, AiReports } from '../../lib/data/aiReport.ts'
import { buildAiSummary } from '../../lib/stats/index.ts'
import { aiRequestOf, commentSections } from './aiComment.ts'
import { splitsOfSets, type AnalysisData, type Scope } from './view.ts'

/** 画面の表示だけを決める。通信は AiCommentPanel が行う */
export interface AiCommentViewProps {
  /** null なら、この範囲では作れない */
  available: { ok: true } | { ok: false; reason: string }
  comment: AiComment | null
  busy: boolean
  error: string | null
  onRequest: (force: boolean) => void
}

const formatTime = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function AiCommentView({ available, comment, busy, error, onRequest }: AiCommentViewProps) {
  return (
    <section className="an-ai" aria-label="AIコメント">
      <h3>AIコメント</h3>
      {!available.ok && <p className="an-empty">{available.reason}</p>}
      {available.ok && (
        <>
          <button type="button" className="an-ai-btn" disabled={busy} onClick={() => onRequest(comment !== null)}>
            {busy ? '考えています…' : comment ? '作り直す' : 'AIに分析してもらう'}
          </button>
          <p className="an-note">選手の名前は送らず、背番号と数値だけをAIに送ります。</p>
        </>
      )}
      {error && (
        <p className="an-error" role="alert">
          {error}
        </p>
      )}
      {comment && (
        <div className="an-ai-body">
          {commentSections(comment.comment).map((s, i) => (
            <div key={`${s.heading ?? ''}${i}`}>
              {s.heading && <h4 className="an-ai-heading">{s.heading}</h4>}
              <p className="an-ai-text">{s.body}</p>
            </div>
          ))}
          <p className="an-note">
            {formatTime(comment.createdAt)}
            {comment.cached ? ' に作った保存済みのコメントです。' : ' に作りました。'}
            本数の少ない項目は参考程度に読んでください。
          </p>
        </div>
      )}
    </section>
  )
}

interface Props {
  teamId: string
  scope: Scope | null
  data: AnalysisData
  /** 画面は Supabase を直接呼ばないので、呼ぶ側が渡す（lib/data の aiReports） */
  aiReports: AiReports
}

/** 分析画面の AI コメント（T-32）。範囲が変わったら保存済みを読み、ボタンで Gemini に頼む */
export function AiCommentPanel({ teamId, scope, data, aiReports }: Props) {
  const scopeKind = scope?.kind
  const req = useMemo(() => (scope ? aiRequestOf(scope, data) : null), [scope, data])
  const key = req?.scope ?? null
  const [comment, setComment] = useState<AiComment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 範囲が変わったら、前の範囲のコメントを消して、保存済みのコメントを読む
  useEffect(() => {
    setComment(null)
    setError(null)
    if (key === null) return
    let cancelled = false
    aiReports
      .latest(teamId, key)
      .then((saved) => {
        if (!cancelled) setComment(saved)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'AI のコメントを読めませんでした。')
      })
    return () => {
      cancelled = true
    }
  }, [aiReports, teamId, key])

  const request = (force: boolean) => {
    if (!req || busy) return
    setBusy(true)
    setError(null)
    aiReports
      .request({ teamId, scope: req.scope, summary: buildAiSummary(req.input, zoneOf, splitsOfSets(data.gameSets)), force })
      .then((made) => setComment(made))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'AI のコメントを作れませんでした。'))
      .finally(() => setBusy(false))
  }

  const available = req
    ? ({ ok: true } as const)
    : ({
        ok: false,
        reason: scopeKind === 'practice' ? '練習はAIコメントの対象外です。' : 'この範囲には記録がありません。',
      } as const)

  return <AiCommentView available={available} comment={comment} busy={busy} error={error} onRequest={request} />
}
