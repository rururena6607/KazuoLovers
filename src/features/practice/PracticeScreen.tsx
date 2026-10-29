import { useEffect, useState } from 'react'
import Court from '../../components/Court.tsx'
import { MIN_SAMPLE, type RecordRepository, type ServeRecord, type ServeType } from '../../contracts/index.ts'
import { zoneOf } from '../../lib/court/index.ts'
import { DEMO_PLAYERS, DEMO_PRACTICE, DEMO_PRACTICE_SET } from '../record/demo.ts'
import { SERVE_TYPES, playerLabel } from '../record/labels.ts'
import { practiceSummary } from './summary.ts'

// 練習モード（F-10）。相手なしでサーブ練習を記録する。選手が自分のスマホで1人でも使える。
// 選手 → 種類 → 狙ったゾーン → 着弾点 → 入った／ミス。得点はない。

interface Props {
  repo: RecordRepository
  onExit: () => void
}

/** 小数第1位の %。本数が少ない値は「*」を付ける（要件定義書 6 章「数値の表示」） */
const pct = (v: number | null, total: number): string =>
  v === null ? '—' : `${v.toFixed(1)}%${total < MIN_SAMPLE ? '*' : ''}`

export default function PracticeScreen({ repo, onExit }: Props) {
  const [serves, setServes] = useState<ServeRecord[]>([])
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [serveType, setServeType] = useState<ServeType>('float')
  const [targetZone, setTargetZone] = useState<number | null>(null)
  const [to, setTo] = useState<{ x: number; y: number } | null>(null)

  useEffect(
    () =>
      repo.subscribe(DEMO_PRACTICE.id, (sets) => {
        setServes(sets.find((s) => s.setId === DEMO_PRACTICE_SET.id)?.serves ?? [])
      }),
    [repo],
  )

  const mine = serves.filter((s) => s.serverId === playerId)
  const summary = practiceSummary(mine)
  const last = mine.at(-1) ?? null

  const confirm = (result: 'in' | 'miss') => {
    if (playerId === null) return
    void repo.save({
      kind: 'serve',
      clientId: crypto.randomUUID(),
      setId: DEMO_PRACTICE_SET.id,
      serverId: playerId,
      serveType,
      fromX: null,
      toX: to?.x ?? null,
      toY: to?.y ?? null,
      result,
      missType: null,
      reception: null,
      receiverId: null,
      targetZone,
      recordedAt: new Date().toISOString(),
    })
    // 選手・種類・狙ったゾーンは残し、着弾点だけ空に戻す
    setTo(null)
  }

  const lastZone = last ? zoneOf('opponent', last.toX, last.toY) : null

  return (
    <section className="record" aria-label="練習モード">
      <header className="record-head">
        <strong>練習モード</strong>
        <button type="button" className="btn btn-sm" onClick={onExit}>
          試合の記録に戻る
        </button>
      </header>

      <div className="chips" role="group" aria-label="選手">
        {DEMO_PLAYERS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn chip"
            aria-pressed={playerId === p.id}
            onClick={() => {
              setPlayerId(p.id)
              setServeType(p.serveType)
            }}
          >
            {playerLabel(p)}
          </button>
        ))}
      </div>

      <div className="row" role="group" aria-label="サーブの種類">
        {SERVE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className="btn btn-sm"
            aria-pressed={serveType === t.value}
            onClick={() => setServeType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="row" role="group" aria-label="狙ったゾーン">
        <span className="chips-label">狙い</span>
        {[1, 2, 3, 4, 5, 6].map((z) => (
          <button
            key={z}
            type="button"
            className="btn btn-sm num"
            aria-pressed={targetZone === z}
            onClick={() => setTargetZone(targetZone === z ? null : z)}
          >
            {z}
          </button>
        ))}
      </div>

      <Court
        side="opponent"
        label="相手コート（着弾点）"
        highlightZone={targetZone}
        marks={to ? [to] : []}
        onTap={setTo}
      />

      <div className="row results" role="group" aria-label="結果">
        <button type="button" className="btn" disabled={playerId === null} onClick={() => confirm('in')}>
          入った
        </button>
        <button type="button" className="btn" disabled={playerId === null} onClick={() => confirm('miss')}>
          ミス
        </button>
      </div>

      <dl className="practice-stats">
        <div>
          <dt>本数</dt>
          <dd className="num">{summary.total}</dd>
        </div>
        <div>
          <dt>成功率</dt>
          <dd className="num">{pct(summary.successRate, summary.total)}</dd>
        </div>
        <div>
          <dt>的中率</dt>
          <dd className="num">{pct(summary.zoneHitRate, summary.total)}</dd>
        </div>
      </dl>

      <footer className="record-foot">
        <span className="num last-entry">
          {last
            ? `${last.result === 'in' ? '入った' : 'ミス'}${lastZone !== null ? ` · Z${lastZone}` : ''}${
                last.targetZone !== null ? `（狙い ${last.targetZone}）` : ''
              }`
            : '—'}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!last}
          onClick={() => last && void repo.remove(last.clientId)}
        >
          取消
        </button>
      </footer>
    </section>
  )
}
