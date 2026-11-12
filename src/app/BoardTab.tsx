import { useEffect, useState } from 'react'
import type { Player } from '../contracts/index.ts'
import BoardScreen from '../features/board/BoardScreen.tsx'
import type { LoadTeam } from './analysisData.ts'

// 作戦ボードのタブ：チームの選手（引退していない人）を読んで渡す。ボード自体は保存しない。

interface Props {
  loadTeam: LoadTeam
  /** このタブを開いているか。開いたときに選手を読み直す（管理で足した選手を出すため） */
  active: boolean
}

export default function BoardTab({ loadTeam, active }: Props) {
  const [players, setPlayers] = useState<readonly Player[]>([])

  useEffect(() => {
    if (!active) return
    let alive = true
    loadTeam()
      .then((team) => {
        if (alive && team) setPlayers(team.players.filter((p) => p.active))
      })
      .catch((e: unknown) => console.error(e))
    return () => {
      alive = false
    }
  }, [active, loadTeam])

  return <BoardScreen players={players} />
}
