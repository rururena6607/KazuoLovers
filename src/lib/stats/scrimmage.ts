// 紅白戦のBチームの成績（要件定義書 5 章「紅白戦の個人成績」、F-27）。T-50。
// Bチームの記録は、自チームのAの記録を裏返したものとして残っている。これを「その部員の記録」の形に読み替えて、
// 既存の指標（serveStatsOf・receptionStatsOfResults・attackStatsOf）にそのまま渡せるようにする。式はここでは持たない。
//   Bのサーブ    ← Aのサーブレシーブ（相手サーバー oppServerId が入っている記録だけ）
//   Bのレシーブ  ← Aのサーブ（受けた相手 receiverId が入っていて、結果が A〜D の記録だけ）
//   Bのアタック  ← 相手のスパイク（打った相手選手 hitterId が入っている記録だけ）
// 部員が分かる本数だけを数え、任意項目が空の記録は誰の本数にも入れない。
// Bのアタックは被ブロックの記録がないので、効果率と失点は出さない（呼ぶ側が打数と決定率だけを出す）。
import type {
  AttackRecord,
  OppAttackRecord,
  ReceptionRecord,
  ServeRecord,
} from '../../contracts/index.ts'

/** 相手選手（opponent_players の id）→ 自チームの部員（players の id） */
export type OppPlayerMap = ReadonlyMap<string, string>

/** playerId を持つ相手選手（紅白戦のBチームの選手）だけを結ぶ */
export function oppPlayerMapOf(
  opponentPlayers: readonly { id: string; playerId?: string | null }[],
): OppPlayerMap {
  const map = new Map<string, string>()
  for (const o of opponentPlayers) if (o.playerId) map.set(o.id, o.playerId)
  return map
}

/**
 * Bチームのサーブ。被エース＝Bのエース、A〜D＝イン（受けた評価つき）、相手ミス＝Bのミス。
 * 相手サーブの種類は任意で、空のときは ServeRecord の形に合わせて 'other' を入れる。そのため、サーブの種類別の表には
 * knownTypeOnly で種類が記録された本数だけを渡す（空の本数を「その他」に混ぜない。扱いは未決：PR #73）
 */
export function bTeamServes(
  receptions: readonly ReceptionRecord[],
  members: OppPlayerMap,
  options: { knownTypeOnly?: boolean } = {},
): ServeRecord[] {
  const out: ServeRecord[] = []
  for (const r of receptions) {
    const serverId = r.oppServerId === null ? undefined : members.get(r.oppServerId)
    if (serverId === undefined) continue
    if (options.knownTypeOnly === true && r.oppServeType === null) continue
    out.push({
      kind: 'serve',
      clientId: `${r.clientId}:b`,
      setId: r.setId,
      serverId,
      serveType: r.oppServeType ?? 'other',
      fromX: null,
      toX: null,
      toY: null,
      result: r.result === 'ace' ? 'ace' : r.result === 'opp_miss' ? 'miss' : 'in',
      missType: r.result === 'opp_miss' ? 'other' : null,
      reception: r.result === 'ace' || r.result === 'opp_miss' ? null : r.result,
      receiverId: null,
      targetZone: null,
      recordedAt: r.recordedAt,
    })
  }
  return out
}

/**
 * Bチームのレシーブ。受けた相手が入っていて、結果が A〜D のサーブだけ。
 * Aのエースとミスは受けた相手が記録されないので入らない（そのため成功率は少し高めに出うる）
 */
export function bTeamReceptions(serves: readonly ServeRecord[], members: OppPlayerMap): ReceptionRecord[] {
  const out: ReceptionRecord[] = []
  for (const s of serves) {
    const receiverId = s.receiverId === null ? undefined : members.get(s.receiverId)
    if (receiverId === undefined || s.result !== 'in' || s.reception === null) continue
    out.push({
      kind: 'reception',
      clientId: `${s.clientId}:b`,
      setId: s.setId,
      receiverId,
      oppServerId: null,
      oppServeType: s.serveType,
      atX: null,
      atY: null,
      result: s.reception,
      recordedAt: s.recordedAt,
    })
  }
  return out
}

/** Bチームのアタック。拾えず＝決定、A〜D＝継続、相手ミス＝ミス */
export function bTeamAttacks(opp: readonly OppAttackRecord[], members: OppPlayerMap): AttackRecord[] {
  const out: AttackRecord[] = []
  for (const o of opp) {
    const attackerId = o.hitterId === null ? undefined : members.get(o.hitterId)
    if (attackerId === undefined) continue
    out.push({
      kind: 'attack',
      clientId: `${o.clientId}:b`,
      setId: o.setId,
      attackerId,
      attackType: null,
      isBack: false,
      toX: null,
      toY: null,
      speed: o.speed ?? null,
      result: o.result === 'killed' ? 'kill' : o.result === 'opp_error' ? 'error' : 'continue',
      prevReception: null,
      recordedAt: o.recordedAt,
    })
  }
  return out
}
