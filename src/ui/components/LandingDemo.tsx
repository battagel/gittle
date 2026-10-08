import { useEffect, useRef, useState } from 'react'
import { createRepo, run } from '../../engine'
import { CytoscapeRenderer } from '../../graph/cytoscape/CytoscapeRenderer'

// A little story on loop: branch off, main moves on, rebase, fast-forward.
const script = [
  'git commit',
  'git switch -c feature',
  'git commit',
  'git commit',
  'git switch main',
  'git commit',
  'git rebase main feature',
  'git switch main',
  'git merge feature',
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function LandingDemo() {
  const container = useRef<HTMLDivElement>(null)
  const [caption, setCaption] = useState<string | null>(null)

  useEffect(() => {
    const renderer = new CytoscapeRenderer({ interactive: false })
    renderer.mount(container.current!)
    let cancelled = false

    const play = async () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        let state = createRepo('demo')
        for (const cmd of script) state = run(state, cmd).state
        renderer.update(state)
        return
      }
      while (!cancelled) {
        let state = createRepo('demo')
        renderer.clear()
        await renderer.update(state)
        setCaption(null)
        for (const cmd of script) {
          await sleep(1100)
          if (cancelled) return
          setCaption(cmd)
          const r = run(state, cmd)
          state = r.state
          await renderer.update(state, r.effects)
        }
        await sleep(2600)
      }
    }
    play()

    return () => {
      cancelled = true
      renderer.destroy()
    }
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-surface shadow-xl ring-1 shadow-ink/5 ring-line">
      <div
        ref={container}
        className="min-h-0 w-full flex-1 bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] bg-size-[20px_20px]"
      />
      <div className="h-12 border-t border-line px-5 py-3 font-mono text-sm">
        <span className="text-muted">$ </span>
        {caption && <span key={caption} className="animate-[fadein_300ms_ease-out]">{caption}</span>}
      </div>
    </div>
  )
}
