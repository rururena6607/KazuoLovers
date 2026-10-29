// 記録画面が試合を開き、試合中に相手の背番号やセットを足す。画面はこのインターフェースだけを使い、Supabase を直接呼ばない。
// 本物は lib/data の teamData（ひろし、T-10）。どの試合を開くかは、管理画面から src/app に渡す。
import type { GameSet, Match, Opponent, OpponentPlayer, Player } from './entities.ts'

/** 記録画面が試合を開くときに要るもの */
export interface MatchContext {
  match: Match
  /** 練習は null */
  opponent: Opponent | null
  /** セットの番号の順 */
  sets: GameSet[]
  /** 背番号の順。引退した選手も含む（過去の記録の表示に使う）。選ぶときは active の選手だけを出す */
  players: Player[]
  /** 背番号の順 */
  opponentPlayers: OpponentPlayer[]
}

export interface MatchRepository {
  loadMatch(matchId: string): Promise<MatchContext>
  /** 試合中にその場で相手の背番号を足す（F-04）。同じ背番号がすでにあれば、それを返す */
  addOpponentPlayer(opponentId: string, number: number): Promise<OpponentPlayer>
  /** 次のセットを作る（F-05「セット終了 → 次のセット」）。5セットあれば reject する */
  createNextSet(matchId: string): Promise<GameSet>
}
