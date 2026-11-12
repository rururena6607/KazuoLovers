// 管理画面（T-10）：チームがなければ作るか招待コードで参加し、あれば試合・選手・相手チームを管理する。F-02〜F-05。
// 招待コード（T-43）：管理者はコードを発行し、部員はコードでほかのチームに移れる。
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Opponent, Team } from '../../contracts/index.ts'
import type { TeamData } from '../../lib/data/teamData.ts'
import { InviteSection } from './InviteSection.tsx'
import { JoinForm } from './JoinForm.tsx'
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

  if (team === null) return <TeamSetup data={data} onCreated={setTeam} onJoined={reloadApp} />

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
        onDeleted={(id) => setOpponents((list) => list.filter((o) => o.id !== id))}
      />
      <InviteSection data={data} teamId={team.id} />
      <section className="admin-section">
        <h2>ほかのチームに移る</h2>
        <p className="admin-mute">移る先の管理者から招待コードをもらって入れます。いまの「{team.name}」からは抜けます。</p>
        <JoinForm data={data} onJoined={reloadApp} />
      </section>
    </div>
  )
}

/**
 * チームに入った・移ったら、アプリを読み直す。記録・分析のタブも、新しいチームの選手と試合で開き直すため
 * （タブの切り替えは src/app にあり、ここからは触らない）
 */
const reloadApp = () => window.location.reload()

/** まだどのチームにも入っていないとき。チームを作った人が管理者になる。部員は招待コードで参加する */
function TeamSetup({
  data,
  onCreated,
  onJoined,
}: {
  data: TeamData
  onCreated: (team: Team) => void
  onJoined: (team: Team) => void
}) {
  const [name, setName] = useState('')
  const { busy, error, run } = useAction()

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => onCreated(await data.createTeam(name)))
  }

  return (
    <div className="admin">
      <h1>チームに入る</h1>
      <p className="admin-mute">
        まだチームに入っていません。部員は、管理者から届いた招待コードで参加します。管理者は、ここでチームを作ります。
      </p>
      <h2>招待コードで参加する</h2>
      <JoinForm data={data} onJoined={onJoined} />
      <h2>チームを作る（管理者）</h2>
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
