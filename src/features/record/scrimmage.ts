// 紅白戦（要件定義書 F-27）。両チームとも自チームの選手から選ぶ。
// B チームは相手チームとして持ち、B チームの選手（OpponentPlayer）は playerId で部員と結ぶ（#51・#63）。
import type { Match, OpponentPlayer, Player } from '../../contracts/index.ts'
import { playerLabel } from './labels.ts'

export const isScrimmage = (match: Match): boolean => match.kind === 'scrimmage'

/**
 * 相手の選手のボタンの文字。B チームの部員なら「7 渡辺」（6 章「選手は背番号と名前」）、
 * ふつうの相手選手（または名簿にいない部員）は背番号だけ
 */
export const oppLabelOf =
  (players: readonly Player[]) =>
  (o: OpponentPlayer): string => {
    const p = o.playerId ? players.find((x) => x.id === o.playerId) : undefined
    return p ? playerLabel(p) : String(o.number)
  }

/** B チームに入っていない部員。A チームの選択肢と、B チームに足せる部員の両方に使う */
export const notInTeamB = (
  players: readonly Player[],
  oppPlayers: readonly OpponentPlayer[],
): Player[] => {
  const inB = new Set(oppPlayers.map((o) => o.playerId).filter((id) => id))
  return players.filter((p) => !inB.has(p.id))
}

/** ふつうの試合の相手選手のボタンの文字（背番号だけ） */
export const numberLabel = (o: OpponentPlayer): string => String(o.number)
