// AI コメントの下ごしらえ（T-32、F-13）。分析画面の範囲から、AI に送る集計の入力と、コメントの範囲の名前を作る。
// 集計そのものは lib/stats の buildAiSummary（T-31）。ここでは範囲に入るセットを集めるだけで、式は持たない。
import type { Match, SetRecords } from '../../contracts/index.ts'
import type { AiSetInput, AiSummaryInput } from '../../lib/stats/index.ts'
import { emptySet } from './setResults.ts'
import { recordsInScope, type AnalysisData, type Scope } from './view.ts'

/**
 * コメントの範囲の名前（ai_reports.scope。lib/data/aiReport.ts の決まりと同じ）。
 * 練習は、AI に送る集計（T-31）が練習のサーブを除くので材料がなく、null（ボタンを出さない）。
 */
export function aiScopeKey(scope: Scope): string | null {
  switch (scope.kind) {
    case 'all':
      return 'all'
    case 'match':
      return `match:${scope.matchId}`
    case 'set':
      return `set:${scope.setId}`
    case 'opponent':
      return `opponent:${scope.opponentId}`
    case 'practice':
      return null
  }
}

/** 範囲に入る試合を日付の古い順（同じ日は id 順）に並べたときの、何試合目か（1 から） */
function matchNumbers(matches: readonly Match[]): Map<string, number> {
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  return new Map(sorted.map((m, i) => [m.id, i + 1]))
}

export interface AiRequest {
  scope: string
  input: AiSummaryInput
}

/** 範囲に記録が1本もなければ null（送る材料がない）。練習の範囲も null */
export function aiRequestOf(scope: Scope, data: AnalysisData): AiRequest | null {
  const key = aiScopeKey(scope)
  if (key === null) return null
  const inScope = recordsInScope(scope, data)
  if (inScope.length === 0) return null
  const recordsOf = new Map<string, SetRecords>(inScope.map((r) => [r.setId, r]))
  const inScopeSets = data.gameSets.filter((gs) => recordsOf.has(gs.id))
  const matchIds = new Set(inScopeSets.map((gs) => gs.matchId))
  const matchNo = matchNumbers(data.matches.filter((m) => matchIds.has(m.id)))
  const sets: AiSetInput[] = []
  for (const gs of inScopeSets) {
    sets.push({
      matchNo: matchNo.get(gs.matchId) ?? 0,
      setNo: gs.setNo,
      ourScore: gs.ourScore,
      oppScore: gs.oppScore,
      records: recordsOf.get(gs.id) ?? emptySet(gs.id),
    })
  }
  const total = sets.reduce(
    (n, s) => n + s.records.serves.length + s.records.receptions.length + s.records.attacks.length,
    0,
  )
  if (total === 0) return null
  return { scope: key, input: { players: data.players, sets } }
}

export interface CommentSection {
  /** 見出し（【】の中）。見出しのない文章は null */
  heading: string | null
  body: string
}

/** 【良かった点】【課題】【練習メニュー案】で分ける。見出しがなければ全体を1つにする */
export function commentSections(comment: string): CommentSection[] {
  const parts = comment.split(/【([^】]+)】/)
  const sections: CommentSection[] = []
  const lead = (parts[0] ?? '').trim()
  if (lead) sections.push({ heading: null, body: lead })
  for (let i = 1; i < parts.length; i += 2) {
    const body = (parts[i + 1] ?? '').trim()
    if (body) sections.push({ heading: parts[i] ?? null, body })
  }
  return sections
}
