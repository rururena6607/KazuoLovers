// 管理画面（T-10）：チームがなければ作り、あれば試合・選手・相手チームを管理する。F-02〜F-05。
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Opponent, Team } from '../../contracts/index.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import { MatchesSection } from './MatchesSection.tsx'
import { OpponentsSection } from './OpponentsSection.tsx'
import { PlayersSection } from './PlayersSection.tsx'
import { useAction } from './useAction.ts'
import './admin.css'

interface Props {
  data: TeamData
  /** 試合を作ったとき・選んだときに呼ぶ。記録のタブに切り替えて、その試合を開く（src/app） */
  onOpenMatch: (matchId: string) => void
}

export function AdminScreen({ data, onOpenMatch }: Props) {
  /** undefined：読んでいる。null：まだチームに入っていない */
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const { error, run } = useAction()

  const load = useCallback(
    () =>
      run(async () => {
        const t = await data.myTeam()
        setOpponents(t ? await data.listOpponents(t.id) : [])
        setTeam(t)
      }),
    [data, run],
  )

  useEffect(() => {
    void load()
  }, [load])

  if (team === undefined) {
    return (
      <div className="admin">
        <h1>管理</h1>
        {error ? (
          <p className="admin-error" role="alert">
            {error}
            <button type="button" className="btn" onClick={() => void load()}>
              読み直す
            </button>
          </p>
        ) : (
          <p className="admin-mute">読んでいます…</p>
        )}
      </div>
    )
  }

  if (team === null) return <TeamSetup data={data} onCreated={setTeam} />

  return (
    <div className="admin">
      <h1>{team.name}</h1>
      <MatchesSection data={data} teamId={team.id} opponents={opponents} onOpenMatch={onOpenMatch} />
      <PlayersSection data={data} teamId={team.id} />
      <OpponentsSection
        data={data}
        teamId={team.id}
        opponents={opponents}
        onAdded={(o) => setOpponents((list) => [...list, o].sort((a, b) => a.name.localeCompare(b.name, 'ja')))}
      />
    </div>
  )
}

/** まだどのチームにも入っていないとき。チームを作った人が管理者になる */
function TeamSetup({ data, onCreated }: { data: TeamData; onCreated: (team: Team) => void }) {
  const [name, setName] = useState('')
  const { busy, error, run } = useAction()

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => onCreated(await data.createTeam(name)))
  }

  return (
    <div className="admin">
      <h1>チームを作る</h1>
      <p className="admin-mute">
        まだチームに入っていません。管理者はここでチームを作ります。部員は、管理者からの招待（T-43）を待ってください。
      </p>
      <form className="admin-form" onSubmit={onSubmit}>
        <label>
          チーム名
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn admin-primary" disabled={busy}>
          {busy ? '作っています…' : 'チームを作る'}
        </button>
      </form>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
