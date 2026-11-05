import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Player } from '../../contracts/index.ts'
import {
  ATTACK_LINE,
  BOARD_H,
  BOARD_W,
  COURT,
  EMPTY_BOARD,
  NET_Y,
  OPP_SPOTS,
  clampPoint,
  ellipseOf,
  isBigEnough,
  oppPieceId,
  pieceAt,
  rotateBoard,
  togglePlayer,
  type AreaTone,
  type BoardState,
  type Point,
  type Shape,
} from './board.ts'
import './board.css'

// 作戦ボード（F-23）。監督がローテーションや守る範囲を説明するのに使う。
// 自チームの駒は名前だけ、相手の駒は番号だけ。保存はしない（説明に使ってすぐ消せるもの）。

interface Props {
  /** スタメンに選べる選手（引退していない選手） */
  players: readonly Player[]
}

type Mode = 'move' | 'arrow' | AreaTone | 'erase'

const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'move', label: '駒を動かす' },
  { value: 'arrow', label: '矢印' },
  { value: 'defend', label: '守る範囲' },
  { value: 'attack', label: '打つ範囲' },
  { value: 'erase', label: '消す' },
]

type Drag = { kind: 'piece'; id: string } | { kind: 'draw'; from: Point; to: Point } | null

/** 駒の丸の大きさ */
const PIECE_R = 7

/** 名前が長いと丸からはみ出すので、文字を小さくする */
const nameSize = (name: string) => (name.length <= 2 ? 4.6 : name.length === 3 ? 3.8 : 3.2)

export default function BoardScreen({ players }: Props) {
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD)
  const [mode, setMode] = useState<Mode>('move')
  const [drag, setDrag] = useState<Drag>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const nextId = useRef(0)

  const nameOf = new Map(players.map((p) => [p.id, p.name]))
  const starters = board.lineup.filter((id): id is string => id !== null)

  /** 画面の座標をボードの座標にする（拡大・縮小されていても合う） */
  const toPoint = (e: ReactPointerEvent): Point | null => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return clampPoint({ x: p.x, y: p.y })
  }

  const capture = (e: ReactPointerEvent) => svgRef.current?.setPointerCapture(e.pointerId)

  const startPiece = (id: string, e: ReactPointerEvent) => {
    if (mode !== 'move') return
    e.stopPropagation()
    capture(e)
    setDrag({ kind: 'piece', id })
  }

  const startDraw = (e: ReactPointerEvent) => {
    if (mode === 'move' || mode === 'erase') return
    const p = toPoint(e)
    if (!p) return
    capture(e)
    setDrag({ kind: 'draw', from: p, to: p })
  }

  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const p = toPoint(e)
    if (!p) return
    if (drag.kind === 'piece') setBoard((b) => ({ ...b, moved: { ...b.moved, [drag.id]: p } }))
    else setDrag({ ...drag, to: p })
  }

  const onUp = () => {
    if (drag?.kind === 'draw' && isBigEnough(drag.from, drag.to)) {
      nextId.current += 1
      const id = `shape-${nextId.current}`
      const shape: Shape =
        mode === 'arrow'
          ? { id, kind: 'arrow', from: drag.from, to: drag.to }
          : { id, kind: 'area', tone: mode === 'attack' ? 'attack' : 'defend', from: drag.from, to: drag.to }
      setBoard((b) => ({ ...b, shapes: [...b.shapes, shape] }))
    }
    setDrag(null)
  }

  const eraseShape = (id: string, e: ReactPointerEvent) => {
    if (mode !== 'erase') return
    e.stopPropagation()
    setBoard((b) => ({ ...b, shapes: b.shapes.filter((s) => s.id !== id) }))
  }

  const preview: Shape | null =
    drag?.kind === 'draw'
      ? mode === 'arrow'
        ? { id: 'preview', kind: 'arrow', from: drag.from, to: drag.to }
        : { id: 'preview', kind: 'area', tone: mode === 'attack' ? 'attack' : 'defend', from: drag.from, to: drag.to }
      : null

  const drawShape = (s: Shape) =>
    s.kind === 'arrow' ? (
      <line
        key={s.id}
        x1={s.from.x}
        y1={s.from.y}
        x2={s.to.x}
        y2={s.to.y}
        className="board-arrow"
        markerEnd="url(#board-arrowhead)"
        onPointerDown={(e) => eraseShape(s.id, e)}
      />
    ) : (
      <ellipse
        key={s.id}
        {...ellipseOf(s.from, s.to)}
        className={`board-area is-${s.tone}`}
        onPointerDown={(e) => eraseShape(s.id, e)}
      />
    )

  const piece = (id: string, label: string, isOpp: boolean) => {
    const at = pieceAt(board, id)
    if (!at) return null
    return (
      <g
        key={id}
        className={isOpp ? 'board-piece is-opp' : 'board-piece'}
        transform={`translate(${at.x} ${at.y})`}
        onPointerDown={(e) => startPiece(id, e)}
      >
        <circle r={PIECE_R} />
        <text style={{ fontSize: isOpp ? 6 : nameSize(label) }}>{label}</text>
      </g>
    )
  }

  return (
    <section className="board" aria-label="作戦ボード">
      <header className="record-head">
        <strong>作戦ボード</strong>
        <span>保存されません（説明用）</span>
      </header>

      <div className="chips" role="group" aria-label="スタメン（6人まで。押した順にポジション1〜6）">
        {players.map((p) => {
          const pos = board.lineup.indexOf(p.id)
          return (
            <button
              key={p.id}
              type="button"
              className="btn chip"
              aria-pressed={pos !== -1}
              onClick={() => setBoard((b) => ({ ...b, lineup: togglePlayer(b.lineup, p.id) }))}
            >
              {pos !== -1 && <span className="board-pos">{pos + 1}</span>}
              {p.name}
            </button>
          )
        })}
      </div>

      <div className="row" role="group" aria-label="ローテーションと駒">
        <button
          type="button"
          className="btn btn-sm"
          disabled={starters.length === 0}
          onClick={() => setBoard((b) => rotateBoard(b))}
        >
          ローテを回す
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={starters.length === 0}
          onClick={() => setBoard((b) => rotateBoard(b, true))}
        >
          1つ戻す
        </button>
        <button
          type="button"
          className="btn btn-sm"
          aria-pressed={board.showOpp}
          onClick={() => setBoard((b) => ({ ...b, showOpp: !b.showOpp }))}
        >
          相手の駒
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setBoard((b) => ({ ...b, moved: {} }))}>
          駒を元の位置に
        </button>
      </div>

      <div className="row seg" role="group" aria-label="描くもの">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className="btn btn-sm"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        className={`board-court is-${mode}`}
        viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        role="img"
        aria-label="コート（上が相手、下が自チーム）"
        onPointerDown={startDraw}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <marker id="board-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="board-arrowhead" />
          </marker>
        </defs>
        <rect {...COURT} className="board-floor" />
        <line x1={COURT.x} x2={COURT.x + COURT.width} y1={NET_Y - ATTACK_LINE} y2={NET_Y - ATTACK_LINE} className="board-line" />
        <line x1={COURT.x} x2={COURT.x + COURT.width} y1={NET_Y + ATTACK_LINE} y2={NET_Y + ATTACK_LINE} className="board-line" />
        <rect {...COURT} className="board-line board-outline" />
        <line x1={0} x2={BOARD_W} y1={NET_Y} y2={NET_Y} className="board-net" />

        {board.shapes.map(drawShape)}
        {preview && <g className="is-preview">{drawShape(preview)}</g>}

        {board.showOpp && OPP_SPOTS.map((_, i) => piece(oppPieceId(i + 1), String(i + 1), true))}
        {starters.map((id) => piece(id, nameOf.get(id) ?? '?', false))}
      </svg>

      <div className="row">
        <button
          type="button"
          className="btn btn-sm"
          disabled={board.shapes.length === 0}
          onClick={() => setBoard((b) => ({ ...b, shapes: [] }))}
        >
          図を全部消す
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setBoard(EMPTY_BOARD)}>
          全部やり直す
        </button>
      </div>
    </section>
  )
}
