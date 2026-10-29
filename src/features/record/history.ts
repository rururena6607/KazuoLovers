// 取消・修正（要件定義書 F-08）。セットの記録を時刻順に並べ、直前の1本の取消と、一覧からの削除・修正に使う。
import type {
  Grade,
  OpponentPlayer,
  PlayRecord,
  Player,
  PointRecord,
  SetRecords,
} from '../../contracts/index.ts'
import { zoneOf } from '../../lib/court/index.ts'
import { ATTACK_RESULTS, MISS_TYPES } from './labels.ts'

/** 一覧の1行：サーブ・レシーブ・アタックと、手動の得点（数字のタップ） */
export type Entry = PlayRecord | PointRecord

/** 時刻順の一覧。自動の得点は元の1本といっしょに扱うので含めない */
export function entriesOf(set: SetRecords | undefined): Entry[] {
  if (!set) return []
  const manual = set.points.filter((p) => p.sourceId === null)
  return [...set.serves, ...set.receptions, ...set.attacks, ...manual].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt),
  )
}

/** 1行を消すときに消す記録の clientId。1本を消すとその得点も消す（取消で得点も戻る） */
export function idsToRemove(entry: Entry, points: readonly PointRecord[]): string[] {
  if (entry.kind === 'point') return [entry.clientId]
  return [entry.clientId, ...points.filter((p) => p.sourceId === entry.clientId).map((p) => p.clientId)]
}

/** 途中の得点を消したあと、残りの得点の「その1点が入ったあとの得点」を付け直す。変わったものだけ返す */
export function renumberPoints(points: readonly PointRecord[]): PointRecord[] {
  const changed: PointRecord[] = []
  let ourScore = 0
  let oppScore = 0
  for (const p of [...points].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    if (p.side === 'us') ourScore++
    else oppScore++
    if (p.ourScore !== ourScore || p.oppScore !== oppScore) changed.push({ ...p, ourScore, oppScore })
  }
  return changed
}

/** 得点が変わらない修正だけを許す：インのサーブと A〜D のレシーブの評価 */
export function editableGrade(entry: Entry): Grade | null {
  if (entry.kind === 'serve' && entry.result === 'in') return entry.reception
  if (entry.kind === 'reception' && entry.result !== 'ace' && entry.result !== 'opp_miss') return entry.result
  return null
}

export function withGrade(entry: Entry, grade: Grade): Entry {
  if (entry.kind === 'serve' && entry.result === 'in') return { ...entry, reception: grade }
  if (entry.kind === 'reception' && editableGrade(entry) !== null) return { ...entry, result: grade }
  return entry
}

/**
 * 画面の下に出す1行（要件定義書 6 章の例：`#7 → #12 C · Z1`）。
 * サーブは「サーバー → 受けた相手 結果 · 着弾ゾーン」、レシーブは「相手サーバー → レシーバー 結果」。
 */
export function describe(
  entry: Entry,
  players: readonly Player[],
  oppPlayers: readonly OpponentPlayer[],
): string {
  const own = (id: string | null) => {
    const p = players.find((x) => x.id === id)
    return p ? `#${p.number}` : null
  }
  const opp = (id: string | null) => {
    const p = oppPlayers.find((x) => x.id === id)
    return p ? `#${p.number}` : null
  }
  const join = (...parts: (string | null)[]) => parts.filter((s) => s !== null).join(' ')

  switch (entry.kind) {
    case 'serve': {
      const zone = zoneOf('opponent', entry.toX, entry.toY)
      const result =
        entry.result === 'ace'
          ? 'エース'
          : entry.result === 'miss'
            ? `ミス(${MISS_TYPES.find((m) => m.value === entry.missType)?.label ?? ''})`
            : entry.reception
      const receiver = opp(entry.receiverId)
      const head = receiver ? `${own(entry.serverId)} → ${receiver}` : own(entry.serverId)
      return join(head, result, zone !== null ? `· Z${zone}` : null)
    }
    case 'reception': {
      if (entry.result === 'opp_miss') return join(opp(entry.oppServerId), '相手ミス')
      const zone = zoneOf('own', entry.atX, entry.atY)
      const server = opp(entry.oppServerId)
      const receiver = own(entry.receiverId) ?? '?'
      const head = server ? `${server} → ${receiver}` : `受 ${receiver}`
      return join(head, entry.result === 'ace' ? '被エース' : entry.result, zone !== null ? `· Z${zone}` : null)
    }
    case 'attack':
      return join(
        own(entry.attackerId),
        entry.isBack ? 'バックアタック' : 'アタック',
        ATTACK_RESULTS.find((r) => r.value === entry.result)?.label ?? null,
      )
    case 'point':
      return `+1 ${entry.side === 'us' ? '自チーム' : '相手'}（${entry.ourScore}-${entry.oppScore}）`
  }
}
