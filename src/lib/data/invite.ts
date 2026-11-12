// 招待コードでの部員の参加（T-43、F-02）：入れたコードの整え方と、サーバーの返事の読み方。
// コードの形は supabase/migrations/20261112000000_invite_code.sql の private.new_invite_code() と同じにする。
import type { Team } from '../../contracts/index.ts'

/** 見間違えやすい 0・O・1・I を除いた 32 文字 */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const INVITE_CODE_LENGTH = 8

/** 参加する前に見せること */
export interface JoinPreview {
  /** 入るチーム */
  teamName: string
  /** 抜けるチーム（残る） */
  leaving: string[]
  /** 抜けると消えるチーム（自分のほかに管理者がいない）。選手・試合・記録もいっしょに消える */
  deleting: string[]
}

/** 管理画面に出す招待コード。管理者でなければ isAdmin が false で、code は null */
export interface InviteInfo {
  isAdmin: boolean
  /** まだ発行していなければ null */
  code: string | null
}

/** 全角を半角にし、空白とハイフン（似た文字も）を取り、大文字にする（サーバーも空白とハイフンを取る） */
export function normalizeInviteCode(text: string): string {
  return text.normalize('NFKC').replace(/[\s\-‐‑‒–—―−ー－]/g, '').toUpperCase()
}

/** 整えたあとのコードが形に合わなければ、理由を返す */
export function checkInviteCode(code: string): string | null {
  if (code.length !== INVITE_CODE_LENGTH || [...code].some((c) => !INVITE_CODE_ALPHABET.includes(c))) {
    return `招待コードは ${INVITE_CODE_LENGTH} 文字の英数字です。管理者から届いたコードを確かめてください。`
  }
  return null
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')

const broken = (): never => {
  throw new Error('サーバーの返事が読めませんでした。')
}

export function joinPreviewFromRow(v: unknown): JoinPreview {
  if (!isRecord(v) || typeof v.team_name !== 'string' || !isStringArray(v.leaving) || !isStringArray(v.deleting)) {
    return broken()
  }
  return { teamName: v.team_name, leaving: v.leaving, deleting: v.deleting }
}

export function inviteInfoFromRow(v: unknown): InviteInfo {
  if (!isRecord(v) || typeof v.is_admin !== 'boolean' || !(v.code === null || typeof v.code === 'string')) {
    return broken()
  }
  return { isAdmin: v.is_admin, code: v.code }
}

export function teamFromJoinRow(v: unknown): Team {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return broken()
  return { id: v.id, name: v.name }
}

/** 招待リンクで招待コードを渡す URL のパラメーター（例：https://…/?invite=ABCD2345） */
export const INVITE_PARAM = 'invite'

/** 招待リンク。base はアプリの置き場所（Vercel なら '/'、edu3 なら '/~…/KazuoLovers/'） */
export function inviteLink(origin: string, base: string, code: string): string {
  const url = new URL(base, origin)
  url.searchParams.set(INVITE_PARAM, code)
  return url.toString()
}

/**
 * URL の招待コード。招待リンクでなければ null。
 * リンクが途中で切れているなど形が違えば { code: null }（画面で理由を出す）
 */
export function inviteCodeFromUrl(search: string): { code: string | null } | null {
  const raw = new URLSearchParams(search).get(INVITE_PARAM)
  if (raw === null) return null
  const code = normalizeInviteCode(raw)
  return { code: checkInviteCode(code) === null ? code : null }
}

/** 招待コードを取り除いた URL（参加した・やめたあとに、アドレスバーから消す） */
export function urlWithoutInvite(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(INVITE_PARAM)
  return url.toString()
}
