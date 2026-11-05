import { describe, expect, it } from 'vitest'
import type { GameSet, Player } from '../../contracts/index.ts'
import { DEFAULT_SET_POINTS } from '../../contracts/index.ts'
import {
  checkColSplits,
  checkMatch,
  checkOpponentPlayerNumber,
  checkPlayer,
  matchFromRow,
  matchToRow,
  nextSetNo,
  opponentPlayerFromRow,
  playerFromRow,
  playerToRow,
  setFromRow,
  sortPlayers,
  toDataErrorMessage,
  withoutScrimmageTeams,
  type MatchInput,
  type PlayerInput,
} from './teamRows.ts'

const input: PlayerInput = {
  number: 7,
  name: ' 渡辺 ',
  position: '',
  serveType: 'jump_float',
  active: true,
}

const match: MatchInput = {
  kind: 'match',
  opponentId: 'o1',
  date: '2026-10-29',
  tournament: ' 新人戦 ',
  setPoints: DEFAULT_SET_POINTS,
}

const player = (number: number, active = true): Player => ({
  id: `p${number}`,
  teamId: 't1',
  number,
  name: `選手${number}`,
  position: null,
  serveType: 'float',
  active,
})

const set = (setNo: number): GameSet => ({
  id: `s${setNo}`,
  matchId: 'm1',
  setNo,
  ourScore: 0,
  oppScore: 0,
})

describe('選手', () => {
  it('名前の前後の空白を除き、空のポジションは null にする。id がなければ送らない', () => {
    expect(playerToRow('t1', input)).toEqual({
      team_id: 't1',
      number: 7,
      name: '渡辺',
      position: null,
      serve_type: 'jump_float',
      active: true,
    })
    expect(playerToRow('t1', { ...input, id: 'p7' })).toMatchObject({ id: 'p7' })
  })

  it('行から Player に戻せる', () => {
    const row = { id: 'p7', ...playerToRow('t1', input) }
    expect(playerFromRow(row)).toEqual({
      id: 'p7',
      teamId: 't1',
      number: 7,
      name: '渡辺',
      position: null,
      serveType: 'jump_float',
      active: true,
    })
  })

  it('背番号は 0〜99 の整数、名前は 1〜50 文字', () => {
    expect(checkPlayer(input)).toBeNull()
    expect(checkPlayer({ ...input, number: 0 })).toBeNull()
    expect(checkPlayer({ ...input, number: 100 })).toBe('背番号は 0〜99 で入れてください。')
    expect(checkPlayer({ ...input, number: 1.5 })).toBe('背番号は 0〜99 で入れてください。')
    expect(checkPlayer({ ...input, name: '  ' })).toBe('名前は 1〜50 文字で入れてください。')
    expect(checkPlayer({ ...input, name: 'あ'.repeat(51) })).toBe('名前は 1〜50 文字で入れてください。')
    expect(checkOpponentPlayerNumber(12)).toBeNull()
    expect(checkOpponentPlayerNumber(-1)).toBe('背番号は 0〜99 で入れてください。')
  })

  it('背番号の順に並べ、引退した選手はうしろにする', () => {
    const sorted = sortPlayers([player(12), player(3, false), player(7), player(1, false)])
    expect(sorted.map((p) => p.number)).toEqual([7, 12, 1, 3])
  })
})

describe('試合', () => {
  it('大会名の空白を除く。練習では相手を送らない', () => {
    expect(matchToRow('t1', match)).toEqual({
      team_id: 't1',
      kind: 'match',
      opponent_id: 'o1',
      date: '2026-10-29',
      tournament: '新人戦',
      set_points: 25,
    })
    expect(matchToRow('t1', { ...match, kind: 'practice', tournament: '' })).toMatchObject({
      opponent_id: null,
      tournament: null,
    })
  })

  it('行から Match に戻せる', () => {
    const row = { id: 'm1', ...matchToRow('t1', match) }
    expect(matchFromRow(row)).toEqual({ id: 'm1', teamId: 't1', ...match, tournament: '新人戦' })
  })

  it('日付・練習の相手・1セットの点数を確かめる', () => {
    expect(checkMatch(match)).toBeNull()
    expect(checkMatch({ ...match, date: '' })).toBe('日付を選んでください。')
    expect(checkMatch({ ...match, kind: 'practice' })).toBe('練習には相手を付けません。')
    expect(checkMatch({ ...match, setPoints: 0 })).toBe('1セットの点数は 1〜50 で入れてください。')
  })
})

describe('紅白戦（F-27）', () => {
  it('B チームの相手チームを持つ。練習と違い、相手は送る', () => {
    const scrimmage: MatchInput = { ...match, kind: 'scrimmage', opponentId: 'o-b' }
    expect(matchToRow('t1', scrimmage)).toMatchObject({ kind: 'scrimmage', opponent_id: 'o-b' })
    const row = { id: 'm2', ...matchToRow('t1', scrimmage) }
    expect(matchFromRow(row)).toMatchObject({ kind: 'scrimmage', opponentId: 'o-b' })
  })

  it('B チームは作るときに自動で付くので、相手がなくても確かめを通す。練習は相手を付けられない（これまでどおり）', () => {
    expect(checkMatch({ ...match, kind: 'scrimmage', opponentId: 'o-b' })).toBeNull()
    expect(checkMatch({ ...match, kind: 'scrimmage', opponentId: null })).toBeNull()
    expect(checkMatch({ ...match, kind: 'practice', opponentId: 'o1' })).toBe('練習には相手を付けません。')
  })

  it('相手チームの一覧から、紅白戦の B チームを除く', () => {
    const teams = [{ id: 'o1' }, { id: 'o-b1' }, { id: 'o2' }, { id: 'o-b2' }]
    expect(withoutScrimmageTeams(teams, ['o-b1', null, 'o-b2'])).toEqual([{ id: 'o1' }, { id: 'o2' }])
    expect(withoutScrimmageTeams(teams, [])).toEqual(teams)
  })

  it('B チームの選手は、対応する自チームの選手（player_id）を持つ。ふつうの相手選手は、これまでと同じ形', () => {
    expect(opponentPlayerFromRow({ id: 'op1', opponent_id: 'o-b', number: 8, player_id: 'p8' })).toEqual({
      id: 'op1',
      opponentId: 'o-b',
      number: 8,
      playerId: 'p8',
    })
    expect(opponentPlayerFromRow({ id: 'op2', opponent_id: 'o1', number: 4, player_id: null })).toEqual({
      id: 'op2',
      opponentId: 'o1',
      number: 4,
    })
  })
})

describe('セットの列の境目（F-24）', () => {
  const base = { id: 's1', match_id: 'm1', set_no: 1, our_score: 10, opp_score: 8 }

  it('両方あれば GameSet に入れる', () => {
    expect(setFromRow({ ...base, col_split_1: 0.3, col_split_2: 0.7 })).toEqual({
      id: 's1',
      matchId: 'm1',
      setNo: 1,
      ourScore: 10,
      oppScore: 8,
      colSplit1: 0.3,
      colSplit2: 0.7,
    })
  })

  it('空（既定の 3 等分）なら、付けない。片方だけのときも付けない（両方そろえて設定する約束）', () => {
    const empty = setFromRow({ ...base, col_split_1: null, col_split_2: null })
    expect(empty).not.toHaveProperty('colSplit1')
    expect(empty).not.toHaveProperty('colSplit2')
    const half = setFromRow({ ...base, col_split_1: 0.3, col_split_2: null })
    expect(half).not.toHaveProperty('colSplit1')
  })
})

describe('checkColSplits（列の境目の確認）', () => {
  it('0 ≤ 左 < 右 ≤ 1 なら通す（端の値も含む）', () => {
    expect(checkColSplits(0.3, 0.7)).toBeNull()
    expect(checkColSplits(0, 1)).toBeNull()
    expect(checkColSplits(0.01, 0.02)).toBeNull()
  })

  it('等しい・逆順・範囲外・数でないものは、理由を返す（DB の check 制約と同じ）', () => {
    expect(checkColSplits(0.5, 0.5)).toMatch('左の境目')
    expect(checkColSplits(0.7, 0.3)).toMatch('左の境目')
    expect(checkColSplits(-0.01, 0.5)).toMatch('0〜1')
    expect(checkColSplits(0.5, 1.01)).toMatch('0〜1')
    expect(checkColSplits(Number.NaN, 0.5)).toMatch('正しくありません')
    expect(checkColSplits(0.2, Number.POSITIVE_INFINITY)).toMatch('正しくありません')
  })
})

describe('nextSetNo', () => {
  it('いちばん大きいセットの番号の次。セットがなければ 1、5セットあれば null', () => {
    expect(nextSetNo([])).toBe(1)
    expect(nextSetNo([set(1), set(2)])).toBe(3)
    expect(nextSetNo([set(2)])).toBe(3)
    expect(nextSetNo([1, 2, 3, 4, 5].map(set))).toBeNull()
  })
})

describe('toDataErrorMessage', () => {
  it('よくあるエラーを日本語にする', () => {
    expect(toDataErrorMessage({ message: 'duplicate key', code: '23505' })).toBe(
      'すでに登録されています（背番号やセットの番号が重なっています）。',
    )
    expect(toDataErrorMessage({ message: 'new row violates row-level security', code: '42501' })).toBe(
      'このチームのデータを変える権限がありません。',
    )
    expect(toDataErrorMessage({ message: 'TypeError: Failed to fetch' })).toBe(
      '通信できませんでした。電波のよい場所でもう一度試してください。',
    )
    expect(toDataErrorMessage({ message: 'boom' })).toBe('保存できませんでした（boom）')
  })
})
