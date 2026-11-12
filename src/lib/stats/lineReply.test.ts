import { describe, expect, it } from 'vitest'
import type {
  AttackRecord,
  Grade,
  ReceptionRecord,
  ServeRecord,
} from '../../contracts/index.ts'
import {
  LINE_MAX_TEXT_LENGTH,
  formatMatchResult,
  formatPlayerReport,
  type LineSetResult,
} from './lineReply.ts'

const at = '2026-11-05T00:00:00Z'
const serve = (o: Partial<ServeRecord>): ServeRecord => ({
  kind: 'serve',
  clientId: 'c',
  setId: 's1',
  serverId: 'p7',
  serveType: 'float',
  fromX: 0.5,
  toX: 0.5,
  toY: 0.5,
  result: 'in',
  missType: null,
  reception: 'A',
  receiverId: null,
  targetZone: null,
  recordedAt: at,
  ...o,
})
const reception = (result: ReceptionRecord['result']): ReceptionRecord => ({
  kind: 'reception',
  clientId: 'c',
  setId: 's1',
  receiverId: result === 'opp_miss' ? null : 'p7',
  oppServerId: null,
  oppServeType: null,
  atX: null,
  atY: null,
  result,
  recordedAt: at,
})
const attack = (result: AttackRecord['result']): AttackRecord => ({
  kind: 'attack',
  clientId: 'c',
  setId: 's1',
  attackerId: 'p7',
  attackType: null,
  isBack: false,
  toX: null,
  toY: null,
  result,
  prevReception: null,
  recordedAt: at,
})
const times = <T,>(n: number, make: () => T): T[] => Array.from({ length: n }, make)
const inServe = (reception: Grade): ServeRecord => serve({ result: 'in', reception })

// JVA の記録票（要件定義書 5 章「指標」の出典）と同じ数字：
//   サーブ 打数61・エース2・効果25・ミス4 → サーブ効果率 11.9%
//   サーブレシーブ 受数64・A23・B11 → 44.5%
//   アタック 打数110・得点35 → アタック決定率 31.8%
const teamServes = [
  ...times(2, () => serve({ result: 'ace', reception: null })),
  ...times(4, () => serve({ result: 'miss', missType: 'out', reception: null })),
  ...times(15, () => inServe('C')), // 効果 = C + D = 25
  ...times(10, () => inServe('D')),
  ...times(20, () => inServe('A')), // 残り 30 本は A・B
  ...times(10, () => inServe('B')),
]
const teamReceptions = [
  ...times(23, () => reception('A')),
  ...times(11, () => reception('B')),
  ...times(20, () => reception('C')),
  ...times(7, () => reception('D')),
  ...times(3, () => reception('ace')),
  ...times(2, () => reception('opp_miss')), // 相手ミスは受数に入らない
]
const teamAttacks = [
  ...times(35, () => attack('kill')),
  ...times(7, () => attack('error')),
  ...times(5, () => attack('blocked')), // 失点 = ミス + 被ブロック = 12
  ...times(63, () => attack('continue')),
]
const sets: LineSetResult[] = [
  { setNo: 1, ourScore: 25, oppScore: 22, records: { serves: teamServes, receptions: teamReceptions, attacks: teamAttacks } },
  { setNo: 2, ourScore: 19, oppScore: 25, records: { serves: [], receptions: [], attacks: [] } },
  { setNo: 3, ourScore: 25, oppScore: 17, records: { serves: [], receptions: [], attacks: [] } },
]
const input = { date: '2026-10-20', opponentName: 'A高校', tournament: null, sets, aiComment: null }

describe('formatMatchResult（「結果」）', () => {
  const [result, ai] = formatMatchResult({ ...input, aiComment: '【課題】レシーブ' })
  const lines = (result ?? '').split('\n')

  it('試合の見出し・セット数・セットごとの得点（25-22 / 19-25 / 25-17）を出す', () => {
    expect(lines.slice(0, 3)).toEqual(['2026-10-20 vs A高校', 'セット 2-1', '25-22 / 19-25 / 25-17'])
  })

  it('チームの指標は JVA の記録票の数字と同じ：サーブ効果率 11.9%・サーブレシーブ成功率 44.5%・アタック決定率 31.8%', () => {
    expect(result).toContain('サーブ 打数61 サーブ効果率11.9% エース率3.3% ミス率6.6%')
    expect(result).toContain('レシーブ 受数64 サーブレシーブ成功率44.5% 被エース率4.7%')
    expect(result).toContain('アタック 打数110 アタック決定率31.8% 効果率20.9% 失点12')
  })

  it('本数が十分なら「*」も参考値の注も出さない', () => {
    expect(result).not.toContain('*')
  })

  it('2つ目の吹き出しは AI のコメント。なければ案内を出す', () => {
    expect(ai).toBe('AI のコメント\n【課題】レシーブ')
    expect(formatMatchResult(input)[1]).toContain('AI のコメントはまだありません')
  })

  it('得点の記録がないときは、得点の行とセット数を出さず、指標は本数 0 の「−」', () => {
    const [empty] = formatMatchResult({ ...input, sets: [] })
    expect(empty).toContain('まだ得点の記録がありません')
    expect(empty).not.toContain('セット ')
    expect(empty).toContain('サーブ 打数0 サーブ効果率−')
  })

  it('練習の試合は「練習」と出し、大会名があれば添える。練習のサーブは指標に入れない', () => {
    const practice = serve({ result: 'miss', missType: 'net', reception: null, targetZone: 3 })
    const [r] = formatMatchResult({
      ...input,
      opponentName: null,
      tournament: '春季大会',
      sets: [{ setNo: 1, ourScore: 0, oppScore: 0, records: { serves: [practice], receptions: [], attacks: [] } }],
    })
    expect(r?.split('\n')[0]).toBe('2026-10-20 練習 春季大会')
    expect(r).toContain('サーブ 打数0')
  })

  it('1つの吹き出しは 5000 文字まで。超えたら末尾を「…」にする', () => {
    const long = formatMatchResult({ ...input, aiComment: 'あ'.repeat(LINE_MAX_TEXT_LENGTH + 100) })[1] ?? ''
    expect(long).toHaveLength(LINE_MAX_TEXT_LENGTH)
    expect(long.endsWith('…')).toBe(true)
  })

  it('絵文字（2単位の文字）を途中で切らない', () => {
    // 見出し「AI のコメント\n」は 9 単位。あ 4989 個で 4998 単位、その次（4998 単位目）が絵文字の上位サロゲート。
    // 4999 単位で切ると絵文字が半分残るので、絵文字ごと落として「あ」の後ろに「…」→ 4998 + 1 = 4999 単位
    const comment = 'あ'.repeat(4989) + '😀'.repeat(10)
    const text = formatMatchResult({ ...input, aiComment: comment })[1] ?? ''
    expect(text).toHaveLength(4999)
    expect(text.endsWith('あ…')).toBe(true)
  })

  it('相手チーム名に「*」があっても、参考値がなければ注を出さない', () => {
    // 打数 61・受数 64・打数 110 で、どれも 10 本以上
    const [r] = formatMatchResult({ ...input, opponentName: 'A*高校' })
    expect(r).not.toContain('参考値')
  })
})

describe('formatPlayerReport（「7番」）', () => {
  it('サーブ・レシーブ・アタックを、指定の項目だけで出す。名前は出さず背番号だけ', () => {
    const text = formatPlayerReport({
      number: 7,
      date: '2026-10-20',
      // 10 本：エース1・ミス1・効果（C・D）3・A・B 5 → 効果率 =（100 + 75 − 25）÷ 10 = 15.0%、ミス率 10.0%
      serves: [
        serve({ result: 'ace', reception: null }),
        serve({ result: 'miss', missType: 'net', reception: null }),
        ...times(3, () => inServe('C')),
        ...times(5, () => inServe('A')),
      ],
      // 受数 10：A5・B3・C2 → （500 + 150）÷ 10 = 65.0%
      receptions: [...times(5, () => reception('A')), ...times(3, () => reception('B')), ...times(2, () => reception('C'))],
      // 打数 10：得点 4 → 40.0%
      attacks: [...times(4, () => attack('kill')), ...times(6, () => attack('continue'))],
    })
    expect(text.split('\n')).toEqual([
      '#7（2026-10-20 の試合）',
      'サーブ 打数10 サーブ効果率15.0% ミス率10.0%',
      'レシーブ 受数10 サーブレシーブ成功率65.0%',
      'アタック 打数10 アタック決定率40.0%',
    ])
  })

  it('10 本未満は「*」を付け、注を足す。マイナスは「−」（記録票の −7.1%）', () => {
    // 打数 7・ミス 2 → （0 + 0 − 50）÷ 7 = −7.1%、ミス率 2 ÷ 7 = 28.6%
    const text = formatPlayerReport({
      number: 12,
      date: '2026-10-20',
      serves: [...times(2, () => serve({ result: 'miss', missType: 'out', reception: null })), ...times(5, () => inServe('A'))],
      receptions: [],
      attacks: [],
    })
    expect(text).toContain('サーブ 打数7 サーブ効果率−7.1%* ミス率28.6%*')
    expect(text).toContain('レシーブ 記録なし')
    expect(text).toContain('アタック 記録なし')
    expect(text).toContain('* は 10 本未満の参考値です。')
  })

  it('練習のサーブ（狙ったゾーンがある）は数えない', () => {
    const text = formatPlayerReport({
      number: 7,
      date: '2026-10-20',
      serves: [serve({ targetZone: 3 })],
      receptions: [],
      attacks: [],
    })
    expect(text).toContain('サーブ 記録なし')
  })
})
