import { useEffect, useRef, useState } from 'react'
import type { Effect, RepoState } from '../../engine'
import { CytoscapeRenderer } from '../../graph/cytoscape/CytoscapeRenderer'
import { unseenOnOrigin } from '../../graph/origin'

interface Props {
  repo: RepoState
  effects: Effect[]
  resets: number
}

export function GraphPanel({ repo, effects, resets }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const renderer = useRef<CytoscapeRenderer | null>(null)
  const drawnResets = useRef(resets)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const r = new CytoscapeRenderer({
      onCommitClick: (sha) => {
        navigator.clipboard?.writeText(sha).catch(() => {})
        setCopied(sha)
      },
    })
    r.mount(container.current!)
    renderer.current = r
    return () => {
      r.destroy()
      renderer.current = null
    }
  }, [])

  useEffect(() => {
    const r = renderer.current
    if (!r) return
    if (drawnResets.current !== resets) {
      drawnResets.current = resets
      r.clear()
    }
    r.update(repo, effects)
  }, [repo, effects, resets])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 1400)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-line bg-surface">
      <div
        ref={container}
        className="h-full w-full bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] bg-size-[20px_20px]"
      />
      <OriginStrip repo={repo} />
      <button
        onClick={() => renderer.current?.fit()}
        className="absolute top-3 right-3 rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted shadow-sm ring-1 ring-line hover:text-ink"
      >
        Fit
      </button>
      {copied && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-xs text-paper shadow-lg">
          Copied <span className="font-mono">{copied}</span>
        </div>
      )}
    </div>
  )
}

/** "origin has 2 new commits on main: git fetch to see them". You only see what you've fetched, like real git. */
function OriginStrip({ repo }: { repo: RepoState }) {
  if (!repo.origin) return null
  const unseen = unseenOnOrigin(repo)
  return (
    <div className="absolute top-3 left-3 flex max-w-[70%] items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs text-muted ring-1 ring-line">
      <span className="text-sky">☁</span>
      {unseen.length === 0 ? (
        <span>origin: nothing new since your last fetch</span>
      ) : (
        <span>
          origin has{' '}
          {unseen
            .map((u) =>
              u.isNew
                ? `a new branch ${u.branch}${u.commits ? ` (${u.commits} commit${u.commits === 1 ? '' : 's'})` : ''}`
                : `${u.commits} new commit${u.commits === 1 ? '' : 's'} on ${u.branch}`,
            )
            .join(', ')}
          : <span className="font-mono text-ink">git fetch</span> to see {unseen.length === 1 && unseen[0].commits === 1 ? 'it' : 'them'}
        </span>
      )}
    </div>
  )
}
