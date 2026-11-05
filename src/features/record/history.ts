// 取消・修正（要件定義書 F-08）。セットの記録を時刻順に並べ、直前の1本の取消と、一覧からの削除・修正に使う。
import type {
  AttackRecord,
  Grade,
  OpponentPlayer,
  PlayRecord,
  Player,
  PointRecord,
  SetRecords,
} from '../../contracts/index.ts'
import { zoneOf } from '../../lib/court/index.ts'
import { ATTACK_RESULTS, MISS_TYPES } from './labels.ts'
import { gradeOf } from './reception.ts'
import { byRecordedAt } from './score.ts'

/** 一覧の1行：サーブ・レシーブ・アタックと、手動の得点（数字のタップ） */
export type Entry = PlayRecord | PointRecord

/** 時刻順の一覧。自動の得点は元の1本といっしょに扱うので含めない */
export function entriesOf(set: SetRecords | undefined): Entry[] {
  if (!set) return []
  const manual = set.points.filter((p) => p.sourceId === null)
  return [...set.serves, ...set.receptions, ...set.attacks, ...manual].sort(byRecordedAt)
}

/** 1行を消すときに消す記録の clientId。1本を消すとその得点も消す（取消で得点も戻る） */
export function idsToRemove(entry: Entry, points: readonly PointRecord[]): string[] {
  if (entry.kind === 'point') return [entry.clientId]
  return [entry.clientId, ...points.filter((p) => p.sourceId === entry.clientId).map((p) => p.clientId)]
}

/** 得点が変わらない修正だけを許す：インのサーブと A〜D のレシーブの評価 */
export function editableGrade(entry: Entry): Grade | null {
  if (entry.kind === 'serve' && entry.result === 'in') return entry.reception
  if (entry.kind === 'reception') return gradeOf(entry)
  return null
}

export function withGrade(entry: Entry, grade: Grade): Entry {
  if (entry.kind === 'serve' && entry.result === 'in') return { ...entry, reception: grade }
  if (entry.kind === 'reception' && editableGrade(entry) !== null) return { ...entry, result: grade }
  return entry
}

/**
 * アタックの prevReception（直前の1本が自チームの A〜D のレシーブならその評価）を、いまの記録に合わせ直す。
 * レシーブの評価を直した・レシーブを消したあとに呼び、付け直しが要るアタックだけを返す。
 * plays は修正・削除を反映したそのセットの1本すべて
 */
export function relinkAttacks(plays: readonly PlayRecord[]): AttackRecord[] {
  const changed: AttackRecord[] = []
  let prev: PlayRecord | null = null
  for (const p of [...plays].sort(byRecordedAt)) {
    if (p.kind === 'attack') {
      const grade = prev?.kind === 'reception' ? gradeOf(prev) : null
      if (p.prevReception !== grade) changed.push({ ...p, prevReception: grade })
    }
    prev = p
  }
  return changed
}

/**
 * 画面の下に出す1行（要件定義書 6 章の例：`#7 → #12 C · Z1`）。
 * サーブは「サーバー → 受けた相手 結果 · 着弾ゾーン」、レシーブは「相手サーバー → レシーバー 結果」。
 * 名簿にいない選手は「?」
 */
export function describeEntry(
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
      const missLabel = MISS_TYPES.find((m) => m.value === entry.missType)?.label
      const result =
        entry.result === 'ace'
          ? 'エース'
          : entry.result === 'miss'
            ? missLabel
              ? `ミス(${missLabel})`
              : 'ミス'
            : entry.reception
      const server = own(entry.serverId) ?? '?'
      const receiver = opp(entry.receiverId)
      const head = receiver ? `${server} → ${receiver}` : server
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
        own(entry.attackerId) ?? '?',
        entry.isBack ? 'バックアタック' : 'アタック',
        ATTACK_RESULTS.find((r) => r.value === entry.result)?.label ?? null,
      )
    case 'opp_attack': {
      const hitter = opp(entry.hitterId)
      const digger = own(entry.diggerId)
      const label = entry.result === 'killed' ? '拾えず' : entry.result === 'opp_error' ? '相手ミス' : entry.result
      return join(hitter ? `${hitter} → 相手スパイク` : '相手スパイク', digger, label)
    }
    case 'point':
      // 途中の得点を消すと記録したときの得点はずれるので、点数は出さない
      return `+1 ${entry.side === 'us' ? '自チーム' : '相手'}`
  }
}
