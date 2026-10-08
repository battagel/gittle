import { useEffect, useRef, useState } from 'react'
import { resetAll } from '../../storage'

const CLICKS = 10

/** The player's score. Easter egg: click it 10 times in a row to be offered a full progress reset. */
export function ScoreBadge({ score }: { score: number }) {
  const [clicks, setClicks] = useState(0)
  const [asking, setAsking] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const click = () => {
    clearTimeout(timer.current)
    const n = clicks + 1
    if (n >= CLICKS) {
      setClicks(0)
      setAsking(true)
      return
    }
    setClicks(n)
    timer.current = setTimeout(() => setClicks(0), 2500) // the clicks have to be in a row
  }

  return (
    <>
      <button
        onClick={click}
        className="rounded-full bg-surface px-4 py-1.5 text-sm text-muted ring-1 ring-line select-none"
        style={{ transform: `rotate(${clicks >= 5 ? (clicks % 2 ? -3 : 3) : 0}deg)` }}
      >
        Score <span className="font-bold text-ink tabular-nums">{score.toLocaleString()}</span>
      </button>
      {asking && <ResetModal onClose={() => setAsking(false)} />}
    </>
  )
}

function ResetModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const reset = () => {
    resetAll()
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-ink/20 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-[460px] rounded-3xl bg-surface p-8 text-center shadow-2xl ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl">🧨</div>
        <h2 className="mt-3 text-xl font-bold">Start over completely?</h2>
        <p className="mt-2 text-sm text-muted">
          You found the reset button. This wipes your score, every level result and your settings from this browser. It
          can't be undone.
        </p>
        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full px-5 py-3 font-semibold whitespace-nowrap ring-1 ring-line hover:bg-paper">
            Keep my progress
          </button>
          <button onClick={reset} className="flex-1 rounded-full bg-coral px-5 py-3 font-semibold whitespace-nowrap text-white">
            Reset everything
          </button>
        </div>
      </div>
    </div>
  )
}
