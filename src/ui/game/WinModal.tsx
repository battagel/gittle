import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { afterLevel } from '../../levels/progress'
import { golfResult } from '../../levels/score'
import { levelName, type Level } from '../../levels/load'
import { celebrate } from './confetti'
import type { WinInfo } from './useGame'

interface Props {
  level: Level
  win: WinInfo
  next: Level | undefined
  onRetry: () => void
  onClose: () => void
}

export function WinModal({ level, win, next, onRetry, onClose }: Props) {
  const result = golfResult(win.strokes, level.par)
  const diff = win.strokes - level.par
  const tone = diff < 0 ? 'text-mint' : diff === 0 ? 'text-indigo' : 'text-amber'

  const celebrated = useRef(false) // StrictMode mounts effects twice in dev
  useEffect(() => {
    if (!celebrated.current) celebrate()
    celebrated.current = true
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-ink/10 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="relative w-[380px] rounded-3xl bg-surface p-8 text-center shadow-2xl ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          title="Close to look at the graph (Esc)"
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full text-muted hover:bg-paper hover:text-ink"
        >
          ✕
        </button>
        <div className="text-sm font-medium text-muted">{levelName(level)}</div>
        <div className={`mt-2 text-5xl font-extrabold tracking-tight ${tone}`}>{result}</div>
        <div className="mt-3 text-muted">
          {win.strokes} {win.strokes === 1 ? 'stroke' : 'strokes'} · par {level.par}
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-paper px-4 py-1.5 font-bold ring-1 ring-line">
          +{win.points} points
          {win.bonus && <span className="rounded-full bg-amber px-2 py-0.5 text-xs text-white">daily ×2</span>}
        </div>
        {win.previousBest !== null && (
          <div className="mt-1 text-sm text-muted">
            Previous best: {golfResult(win.previousBest, level.par)} ({win.previousBest})
          </div>
        )}
        <div className="mt-8 flex flex-col gap-2">
          <Link
            to={afterLevel(level, next).to}
            className="rounded-full bg-ink px-6 py-3 font-semibold text-paper transition hover:-translate-y-0.5"
          >
            {afterLevel(level, next).label}
          </Link>
          <div className="flex gap-2">
            <button onClick={onRetry} className="flex-1 rounded-full px-6 py-3 font-semibold ring-1 ring-line hover:bg-paper">
              ↺ Retry
            </button>
            <Link to="/levels" className="flex-1 rounded-full px-6 py-3 font-semibold ring-1 ring-line hover:bg-paper">
              Levels
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
