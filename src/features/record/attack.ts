// ラリー中の自チームのアタック1本を作る（要件定義書 F-20、5 章「アタックの結果」）。画面から切り離してテストする。
import type {
  AttackRecord,
  AttackResult,
  AttackType,
  Grade,
  PlayRecord,
  Speed,
} from '../../contracts/index.ts'
import type { CourtSide } from '../../lib/court/index.ts'
import { toggle } from './labels.ts'
import { gradeOf } from './reception.ts'

/** 結果ボタンを押す前の入力。攻撃の種類・バックアタック・打った位置と方向・速さは任意 */
export interface AttackDraft {
  attackerId: string | null
  attackType: AttackType | null
  /** バックアタックか。種類「バック」のときは常に true（withAttackType でそろえる） */
  isBack: boolean
  /** 打った位置（矢印の始点。自コート） */
  from: { x: number; y: number } | null
  /** 打った方向（矢印の終点。相手コート） */
  to: { x: number; y: number } | null
  speed: Speed | null
}

export const emptyAttackDraft = (): AttackDraft => ({
  attackerId: null,
  attackType: null,
  isBack: false,
  from: null,
  to: null,
  speed: null,
})

/**
 * 両面のコート図のタップ（F-20「打った位置は自コート、方向は相手コート」）。
 * 自コートを押したら打った位置、相手コートを押したら打った方向にする。どちらから押してもよい
 */
export function withArrowTap(
  draft: AttackDraft,
  side: CourtSide,
  p: { x: number; y: number },
): AttackDraft {
  return side === 'own' ? { ...draft, from: p } : { ...draft, to: p }
}

/**
 * 種類のボタン（押し直しで外す）。「バック」を選んだらバックアタックにし、外したらバックアタックも外す。
 * 「バックならバックアタック」はここだけで決め、表示と保存は isBack だけを見る
 */
export function withAttackType(draft: AttackDraft, type: AttackType): AttackDraft {
  const attackType = toggle(draft.attackType, type)
  const isBack = attackType === 'back' ? true : draft.attackType === 'back' ? false : draft.isBack
  return { ...draft, attackType, isBack }
}

/**
 * サーブレシーブからの攻撃なら、そのレシーブの評価。
 * 直前の1本（lastPlay）が A〜D の自チームのレシーブのときだけで、ラリー中の切り返し（アタックのあと）は null
 */
export const prevReceptionOf = (lastPlay: PlayRecord | null): Grade | null =>
  lastPlay?.kind === 'reception' ? gradeOf(lastPlay) : null

/** 確定した1本。打った選手がいなければ null */
export function buildAttack(
  draft: AttackDraft,
  result: AttackResult,
  prevReception: Grade | null,
  ids: { clientId: string; setId: string; recordedAt: string },
): AttackRecord | null {
  if (draft.attackerId === null) return null
  return {
    kind: 'attack',
    clientId: ids.clientId,
    setId: ids.setId,
    attackerId: draft.attackerId,
    attackType: draft.attackType,
    isBack: draft.isBack,
    fromX: draft.from?.x ?? null,
    fromY: draft.from?.y ?? null,
    toX: draft.to?.x ?? null,
    toY: draft.to?.y ?? null,
    speed: draft.speed,
    result,
    prevReception,
    recordedAt: ids.recordedAt,
  }
}

/**
 * ラリー中に、いまどちらが攻撃する番か（T-36 部活フィードバック）。
 * 自チームのレシーブのあとは自チームが打つ番。自チームのサーブ・アタック（継続）のあとは
 * 相手が打ってくる番なので、アタックの入力を最初から出さない（「こっちのスパイク？」と迷わせない）。
 */
export const rallyTurnOf = (lastPlay: PlayRecord | null): 'us' | 'opp' =>
  lastPlay?.kind === 'reception' ? 'us' : 'opp'
