import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { Brief } from '../components/Brief'

export interface TourStep {
  target: RefObject<HTMLElement | null>
  title: string
  text: string
}

const CARD = 320
const GAP = 16

/** A few spotlighted steps over the play screen, shown once to new players. */
export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useLayoutEffect(() => {
    const el = steps[i].target.current
    const measure = () => setRect(el?.getBoundingClientRect() ?? null)
    measure()
    // the resizable panels settle after mount, so follow the element's own size too
    const observer = new ResizeObserver(measure)
    if (el) observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
    // re-measure per step only: `steps` is rebuilt on every render of the play screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  if (!rect) return null
  const step = steps[i]
  const last = i === steps.length - 1
  // the card goes beside the highlighted area if there's room, otherwise below it
  const right = rect.right + GAP + CARD < window.innerWidth
  const left = rect.left - GAP - CARD > 0
  const cardStyle = right
    ? { left: rect.right + GAP, top: Math.max(GAP, Math.min(rect.top, window.innerHeight - 260)) }
    : left
      ? { left: rect.left - GAP - CARD, top: Math.max(GAP, Math.min(rect.top, window.innerHeight - 260)) }
      : { left: Math.max(GAP, Math.min(rect.left, window.innerWidth - CARD - GAP)), top: rect.bottom + GAP }

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="pointer-events-none fixed rounded-2xl ring-2 ring-indigo transition-all duration-300"
        style={{
          left: rect.left - 6,
          top: rect.top - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          boxShadow: '0 0 0 9999px rgba(31, 35, 40, 0.45)',
        }}
      />
      <div className="fixed rounded-2xl bg-surface p-5 shadow-2xl ring-1 ring-line" style={{ ...cardStyle, width: CARD }}>
        <div className="text-xs font-semibold tracking-wide text-muted uppercase">
          {i + 1} / {steps.length}
        </div>
        <div className="mt-1 text-lg font-bold">{step.title}</div>
        <div className="mt-2">
          <Brief text={step.text} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={onDone} className="text-sm text-muted hover:text-ink">
            Skip tour
          </button>
          <button
            onClick={() => (last ? onDone() : setI(i + 1))}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper"
          >
            {last ? "Let's go" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
