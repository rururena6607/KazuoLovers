// 相手のスパイク1本と、自チームのレシーブ（ディグ）を作る（要件定義書 F-25）。画面から切り離してテストする。
import type { Grade, OppAttackRecord, OppAttackResult, Speed } from '../../contracts/index.ts'
import type { CourtSide } from '../../lib/court/index.ts'

/** 結果ボタンを押す前の入力。どれも任意 */
export interface DigDraft {
  /** 打った相手選手（opponent_players の id） */
  hitterId: string | null
  /** 拾った（触った）自チームの選手 */
  diggerId: string | null
  /** 相手が打った位置（矢印の始点。相手コート） */
  from: { x: number; y: number } | null
  /** 落ちた位置・拾った位置（矢印の終点。自コート） */
  to: { x: number; y: number } | null
  speed: Speed | null
}

export const emptyDigDraft = (): DigDraft => ({
  hitterId: null,
  diggerId: null,
  from: null,
  to: null,
  speed: null,
})

/**
 * 両面のコート図のタップ。F-25「打った位置（相手コート）から落ちた位置（自コート）への矢印」。
 * 相手コートを押したら打った位置、自コートを押したら落ちた位置・拾った位置にする
 */
export function withDigArrowTap(
  draft: DigDraft,
  side: CourtSide,
  p: { x: number; y: number },
): DigDraft {
  return side === 'opponent' ? { ...draft, from: p } : { ...draft, to: p }
}

/** 結果ボタン（F-25「拾えず／A／B／C／D／相手ミス」）の並び */
export const DIG_RESULTS: readonly { value: OppAttackResult; label: string }[] = [
  { value: 'killed', label: '拾えず' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
  { value: 'opp_error', label: '相手ミス' },
]

/** 拾えた（A〜D）ときの評価。拾えず・相手ミスは null */
export const digGradeOf = (result: OppAttackResult): Grade | null =>
  result === 'killed' || result === 'opp_error' ? null : result

/** 確定した1本。結果ボタンで確定し、ほかは任意なので必ず作れる。入れたものをそのまま残す */
export function buildDig(
  draft: DigDraft,
  result: OppAttackResult,
  ids: { clientId: string; setId: string; recordedAt: string },
): OppAttackRecord {
  return {
    kind: 'opp_attack',
    clientId: ids.clientId,
    setId: ids.setId,
    hitterId: draft.hitterId,
    diggerId: draft.diggerId,
    fromX: draft.from?.x ?? null,
    fromY: draft.from?.y ?? null,
    toX: draft.to?.x ?? null,
    toY: draft.to?.y ?? null,
    speed: draft.speed,
    result,
    recordedAt: ids.recordedAt,
  }
}
