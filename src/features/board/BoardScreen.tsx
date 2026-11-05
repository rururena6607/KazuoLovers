import { useRef, useState, type FormEvent, type PointerEvent } from 'react'
import {
  addArea,
  addArrow,
  addPiece,
  clearDrawings,
  emptyBoard,
  movePiece,
  parsePieceNumber,
  removeItem,
  MAX_NAME_LENGTH,
  type Area,
  type AreaKind,
  type Board,
  type Point,
} from './boardModel.ts'
import {
  COURT_H,
  COURT_W,
  MARGIN,
  NET_Y,
  PIECE_R,
  VIEW_H,
  VIEW_W,
  attackLinesY,
  fromSvg,
  toSvg,
} from './boardGeometry.ts'
import './board.css'

// 作戦ボード（F-23、拡張）。コート図に背番号・名前の駒を置いて動かし、矢印と「守る範囲・打つ範囲」を描く。
// 端末の中だけで動く（サーバーにも端末にも保存しない）。タブを切り替えても、描いたものは残る。

type Tool = 'move' | 'arrow' | 'defend' | 'attack' | 'erase'

const TOOLS: readonly { id: Tool; label: string }[] = [
  { id: 'move', label: '駒を動かす' },
  { id: 'arrow', label: '矢印' },
  { id: 'defend', label: '守る範囲' },
  { id: 'attack', label: '打つ範囲' },
  { id: 'erase', label: '消す' },
]

/** 範囲の種類ごとの見た目。色だけに頼らず、線の種類と文字（守／打）でも区別する */
const AREA_STYLE: Record<AreaKind, { label: string; className: string }> = {
  defend: { label: '守', className: 'board-area board-area-defend' },
  attack: { label: '打', className: 'board-area board-area-attack' },
}

interface Draft {
  from: Point
  to: Point
}

/** 操作の取り消しのために残す盤面の数 */
const HISTORY_LIMIT = 50

export default function BoardScreen() {
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [past, setPast] = useState<Board[]>([])
  const [tool, setTool] = useState<Tool>('move')
  const [numberText, setNumberText] = useState('')
  const [name, setName] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  /** 盤面を変えて、1 つ前に戻せるようにする */
  const commit = (next: Board) => {
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), board])
    setBoard(next)
  }
  const undo = () => {
    const prev = past.at(-1)
    if (!prev) return
    setPast(past.slice(0, -1))
    setBoard(prev)
  }

  const pointOf = (e: PointerEvent): Point | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const s = pt.matrixTransform(ctm.inverse())
    return fromSvg({ x: s.x, y: s.y })
  }

  const number = parsePieceNumber(numberText)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (number === null) return
    commit(addPiece(board, number, name))
    setNumberText('')
    setName('')
  }

  const startPiece = (e: PointerEvent, id: string) => {
    if (tool === 'erase') {
      e.stopPropagation()
      commit(removeItem(board, id))
      return
    }
    if (tool !== 'move') return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    // 1 回のドラッグを 1 回の取り消しにするため、動かす前の盤面を残す
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), board])
    setDragId(id)
  }

  const onDown = (e: PointerEvent) => {
    if (tool !== 'arrow' && tool !== 'defend' && tool !== 'attack') return
    const p = pointOf(e)
    if (!p) return
    svgRef.current?.setPointerCapture(e.pointerId)
    setDraft({ from: p, to: p })
  }

  const onMove = (e: PointerEvent) => {
    const p = pointOf(e)
    if (!p) return
    if (dragId) setBoard((b) => movePiece(b, dragId, p))
    else if (draft) setDraft({ ...draft, to: p })
  }

  const onUp = () => {
    if (dragId) {
      setDragId(null)
      return
    }
    if (!draft) return
    const next =
      tool === 'arrow'
        ? addArrow(board, draft.from, draft.to)
        : tool === 'defend' || tool === 'attack'
          ? addArea(board, tool, draft.from, draft.to)
          : board
    if (next !== board) commit(next)
    setDraft(null)
  }

  const [attackOpp, attackOwn] = attackLinesY()
  const netY = toSvg({ x: 0, y: NET_Y }).y

  const areaRect = (a: Pick<Area, 'x0' | 'y0' | 'x1' | 'y1'>) => {
    const p = toSvg({ x: a.x0, y: a.y0 })
    const q = toSvg({ x: a.x1, y: a.y1 })
    return { x: p.x, y: p.y, width: q.x - p.x, height: q.y - p.y }
  }

  const draftArea =
    draft && (tool === 'defend' || tool === 'attack')
      ? {
          kind: tool,
          x0: Math.min(draft.from.x, draft.to.x),
          y0: Math.min(draft.from.y, draft.to.y),
          x1: Math.max(draft.from.x, draft.to.x),
          y1: Math.max(draft.from.y, draft.to.y),
        }
      : null

  const hit = tool === 'erase' ? (id: string) => () => commit(removeItem(board, id)) : undefined

  return (
    <section className="board">
      <h1 className="board-title">作戦ボード</h1>

      <form className="board-add" onSubmit={submit}>
        <input
          className="num"
          aria-label="駒の背番号"
          inputMode="numeric"
          placeholder="背番号"
          value={numberText}
          onChange={(e) => setNumberText(e.target.value)}
        />
        <input
          aria-label="駒の名前（任意）"
          placeholder="名前（任意）"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={number === null}>
          駒を置く
        </button>
      </form>

      <div className="board-tools" role="group" aria-label="道具">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn"
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        className="board-court"
        data-tool={tool}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="作戦ボードのコート図（上が相手コート、下が自コート）"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <marker id="board-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="board-arrowhead" />
          </marker>
        </defs>
        <rect x={MARGIN} y={MARGIN} width={COURT_W} height={COURT_H} className="board-floor" />
        {[attackOpp, attackOwn].map((y) => (
          <line
            key={y}
            x1={MARGIN}
            x2={MARGIN + COURT_W}
            y1={toSvg({ x: 0, y }).y}
            y2={toSvg({ x: 0, y }).y}
            className="board-attack-line"
          />
        ))}
        <line x1={MARGIN - 6} x2={MARGIN + COURT_W + 6} y1={netY} y2={netY} className="board-net" />
        <text x={MARGIN + 4} y={MARGIN + 12} className="board-side">
          相手コート
        </text>
        <text x={MARGIN + 4} y={MARGIN + COURT_H - 5} className="board-side">
          自コート
        </text>

        {board.areas.map((a) => {
          const r = areaRect(a)
          const style = AREA_STYLE[a.kind]
          return (
            <g key={a.id} onPointerDown={hit?.(a.id)} className="board-item">
              <rect {...r} className={style.className} />
              <text x={r.x + 5} y={r.y + 14} className="board-area-label">
                {style.label}
              </text>
            </g>
          )
        })}
        {draftArea && <rect {...areaRect(draftArea)} className={`${AREA_STYLE[draftArea.kind].className} board-draft`} />}

        {board.arrows.map((a) => {
          const f = toSvg(a.from)
          const t = toSvg(a.to)
          return (
            <g key={a.id} onPointerDown={hit?.(a.id)} className="board-item">
              {/* 消すときに指で当てやすいよう、見えない太い線を重ねる */}
              <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} className="board-hit" />
              <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} className="board-arrow" markerEnd="url(#board-arrowhead)" />
            </g>
          )
        })}
        {draft && tool === 'arrow' && (
          <line
            x1={toSvg(draft.from).x}
            y1={toSvg(draft.from).y}
            x2={toSvg(draft.to).x}
            y2={toSvg(draft.to).y}
            className="board-arrow board-draft"
            markerEnd="url(#board-arrowhead)"
          />
        )}

        {board.pieces.map((p) => {
          const c = toSvg(p)
          return (
            <g
              key={p.id}
              className="board-piece"
              data-dragging={p.id === dragId ? '' : undefined}
              onPointerDown={(e) => startPiece(e, p.id)}
            >
              <circle cx={c.x} cy={c.y} r={PIECE_R} className="board-piece-dot" />
              <text x={c.x} y={c.y} className="board-piece-number num">
                {p.number}
              </text>
              {p.name && (
                <text x={c.x} y={c.y + PIECE_R + 11} className="board-piece-name">
                  {p.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <p className="board-hint" role="note">
        {tool === 'move' && '駒をドラッグして動かします。'}
        {tool === 'arrow' && 'コート上をなぞると、矢印を引けます。'}
        {tool === 'defend' && 'コート上をなぞって、守る範囲を囲みます（破線・「守」）。'}
        {tool === 'attack' && 'コート上をなぞって、打つ範囲を囲みます（実線・「打」）。'}
        {tool === 'erase' && '消したい駒・矢印・範囲をタップします。'}
      </p>

      <div className="board-actions">
        <button type="button" className="btn" onClick={undo} disabled={past.length === 0}>
          ひとつ戻す
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => commit(clearDrawings(board))}
          disabled={board.arrows.length === 0 && board.areas.length === 0}
        >
          矢印と範囲を消す
        </button>
      </div>
    </section>
  )
}
