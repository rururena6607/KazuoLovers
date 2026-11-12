// LINE の返信文（要件定義書 F-15、8 章「LINE連携の設計」）。T-34。
//   「結果」：最新試合のセットごとの得点（例：25-22 / 19-25 / 25-17）とチームの主な指標
//   「7番」 ：その選手のサーブ（打数・サーブ効果率・ミス率）、レシーブ（受数・サーブレシーブ成功率）、アタック（打数・アタック決定率）
// 指標の式は metrics.ts（JVA の記録票の式）を使い、ここでは式を持たない。文面を作るだけの純粋な関数。
// 数値の表示は 6 章「数値の表示」に合わせる：小数第1位の %、マイナスは「−」、10 本未満の参考値には「*」、本数 0 は「−」。
// 返信には選手の名前を出さず、背番号だけにする（T-33 の決め方）。
// 練習のサーブ（狙ったゾーンがある）は受けた評価がなく、サーブ効果率が低く出るので、ここで除く（T-31 と同じ）。
// supabase/functions/line-webhook から使う予定。ただし今の line-webhook は「何も import しない」作りなので、
// つなぎ方（src/ からの import を認めるか、写すか）は T-33（ひろし）と未決。
import {
  MIN_SAMPLE,
  type AttackRecord,
  type ReceptionRecord,
  type ServeRecord,
  type SetRecords,
} from '../../contracts/index.ts'
import { attackStatsOf, receptionStatsOf, serveStatsOf } from './metrics.ts'

/**
 * LINE のテキストの吹き出し1つの上限（LINE Messaging API の決まり。要件定義書 8 章「1回の送信」）。
 * 外部 API の制限で、アプリの設定値ではないので contracts/config.ts には置かない
 */
export const LINE_MAX_TEXT_LENGTH = 5000

/** 率がないとき（本数 0）の表示 */
const NO_VALUE = '−'

/** 上限を超えたら末尾を「…」にする。絵文字など2単位の文字（サロゲートペア）を途中で切らない */
function cut(s: string): string {
  if (s.length <= LINE_MAX_TEXT_LENGTH) return s
  let end = LINE_MAX_TEXT_LENGTH - 1
  const last = s.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end-- // 上位サロゲートで終わるなら、その文字ごと落とす
  return `${s.slice(0, end)}…`
}

/** 小数第1位の %。マイナスは「−」（U+2212）。丸めて 0.0 になる負の値には付けない */
function percentText(value: number | null): string {
  if (value === null) return NO_VALUE
  const text = Math.abs(value).toFixed(1)
  return value < 0 && text !== '0.0' ? `−${text}%` : `${text}%`
}

/** 参考値か：本数が 1 本以上 MIN_SAMPLE 本未満（本数 0 は値がなく「−」なので参考値ではない） */
const isReference = (count: number): boolean => count > 0 && count < MIN_SAMPLE

/** 率の表示。参考値には「*」を付ける */
function rateText(value: number | null, count: number): string {
  const text = percentText(value)
  return value !== null && isReference(count) ? `${text}*` : text
}

const REFERENCE_NOTE = `* は ${MIN_SAMPLE} 本未満の参考値です。`

/**
 * 出した率の本数に参考値があれば、末尾に注を足す。
 * 文面の「*」で決めない（相手チーム名や大会名に「*」があると、参考値がなくても注が出てしまうため）
 */
const withNote = (lines: readonly string[], shownCounts: readonly number[]): string =>
  shownCounts.some(isReference) ? [...lines, '', REFERENCE_NOTE].join('\n') : lines.join('\n')

/** 練習のサーブ（狙ったゾーンがある）を除く */
const matchServes = (serves: readonly ServeRecord[]): ServeRecord[] =>
  serves.filter((s) => s.targetZone === null)

// ---- 「結果」 ----

export interface LineSetResult {
  setNo: number
  ourScore: number
  oppScore: number
  /** そのセットの記録。チームの指標に使う */
  records: Pick<SetRecords, 'serves' | 'receptions' | 'attacks'>
}

export interface LineResultInput {
  /** YYYY-MM-DD */
  date: string
  /** 練習なら null */
  opponentName: string | null
  tournament: string | null
  /** セット番号の順 */
  sets: readonly LineSetResult[]
  /** その試合の保存済みの AI コメント。なければ null（Gemini は待たない） */
  aiComment: string | null
}

/**
 * 「結果」の返信。吹き出しは、試合の得点と指標・AI のコメントの2つ（吹き出しの上限 5 つに収まる）。
 * チームの指標は、6 章「指標の並び」どおり：サーブ＝打数・サーブ効果率・エース率・ミス率、
 * レシーブ＝受数・サーブレシーブ成功率・被エース率、アタック＝打数・アタック決定率・効果率・失点
 */
export function formatMatchResult(r: LineResultInput): string[] {
  const title = [r.date, r.opponentName ? `vs ${r.opponentName}` : '練習', r.tournament]
    .filter(Boolean)
    .join(' ')
  const won = r.sets.filter((s) => s.ourScore > s.oppScore).length
  const lost = r.sets.filter((s) => s.ourScore < s.oppScore).length
  const scores =
    r.sets.length === 0
      ? 'まだ得点の記録がありません'
      : r.sets.map((s) => `${s.ourScore}-${s.oppScore}`).join(' / ')

  const serve = serveStatsOf(matchServes(r.sets.flatMap((s) => s.records.serves)))
  const reception = receptionStatsOf(r.sets.flatMap((s) => s.records.receptions))
  const attack = attackStatsOf(r.sets.flatMap((s) => s.records.attacks))
  const metrics = [
    `サーブ 打数${serve.attempts} サーブ効果率${rateText(serve.efficiency, serve.attempts)} エース率${rateText(serve.aceRate, serve.attempts)} ミス率${rateText(serve.missRate, serve.attempts)}`,
    `レシーブ 受数${reception.receptions} サーブレシーブ成功率${rateText(reception.successRate, reception.receptions)} 被エース率${rateText(reception.acedRate, reception.receptions)}`,
    `アタック 打数${attack.attempts} アタック決定率${rateText(attack.killRate, attack.attempts)} 効果率${rateText(attack.efficiency, attack.attempts)} 失点${attack.errors}`,
  ]

  const head = [title, r.sets.length > 0 ? `セット ${won}-${lost}` : null, scores].filter(
    (l): l is string => l !== null,
  )
  const messages = [
    withNote([...head, '', ...metrics], [serve.attempts, reception.receptions, attack.attempts]),
  ]
  messages.push(
    r.aiComment
      ? `AI のコメント\n${r.aiComment}`
      : 'AI のコメントはまだありません。アプリの分析画面で作れます。',
  )
  return messages.map(cut)
}

// ---- 「7番」 ----

export interface LinePlayerInput {
  /** 背番号 */
  number: number
  /** 最新の試合の日付（YYYY-MM-DD） */
  date: string
  /** その選手の、その試合の記録 */
  serves: readonly ServeRecord[]
  receptions: readonly ReceptionRecord[]
  attacks: readonly AttackRecord[]
}

/**
 * 「7番」の返信。サーブ（打数・サーブ効果率・ミス率）、レシーブ（受数・サーブレシーブ成功率）、
 * アタック（打数・アタック決定率）。名前は出さず背番号だけ。記録のない種類は「記録なし」
 */
export function formatPlayerReport(p: LinePlayerInput): string {
  const serve = serveStatsOf(matchServes(p.serves))
  const reception = receptionStatsOf(p.receptions)
  const attack = attackStatsOf(p.attacks)
  const lines = [
    `#${p.number}（${p.date} の試合）`,
    serve.attempts === 0
      ? 'サーブ 記録なし'
      : `サーブ 打数${serve.attempts} サーブ効果率${rateText(serve.efficiency, serve.attempts)} ミス率${rateText(serve.missRate, serve.attempts)}`,
    reception.receptions === 0
      ? 'レシーブ 記録なし'
      : `レシーブ 受数${reception.receptions} サーブレシーブ成功率${rateText(reception.successRate, reception.receptions)}`,
    attack.attempts === 0
      ? 'アタック 記録なし'
      : `アタック 打数${attack.attempts} アタック決定率${rateText(attack.killRate, attack.attempts)}`,
  ]
  return cut(withNote(lines, [serve.attempts, reception.receptions, attack.attempts]))
}
