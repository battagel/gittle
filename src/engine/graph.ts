import type { RepoState, Sha } from './state'

/** Every commit reachable from `sha`, including itself. */
export function ancestors(state: RepoState, sha: Sha): Set<Sha> {
  const seen = new Set<Sha>()
  const stack = [sha]
  while (stack.length) {
    const s = stack.pop()!
    if (seen.has(s)) continue
    seen.add(s)
    stack.push(...state.commits[s].parents)
  }
  return seen
}

/** True if `a` is reachable from `b` (a commit is its own ancestor). */
export function isAncestor(state: RepoState, a: Sha, b: Sha): boolean {
  return ancestors(state, b).has(a)
}

/** First-parent history from root to `sha`, as labels. Handy in tests and for `solutionState`. */
export function firstParentLabels(state: RepoState, sha: Sha): string[] {
  const labels: string[] = []
  for (let s: Sha | undefined = sha; s; s = state.commits[s].parents[0]) {
    labels.unshift(state.commits[s].label)
  }
  return labels
}

/** The parts of a change: "C4", "-C4", or several for a reverted merge. */
export const parts = (change: string): string[] => (change ? change.split(' ') : [])

const flip = (part: string) => (part.startsWith('-') ? part.slice(1) : `-${part}`)

export function invert(change: string): string {
  return parts(change).map(flip).sort().join(' ')
}

/**
 * How many times each change is in effect at `tip`: +1 for each commit adding it, −1 for each removing it.
 * Think of each change as adding (or, negated, removing) its own file.
 */
export function netChanges(state: RepoState, tip: Sha): Map<string, number> {
  const net = new Map<string, number>()
  for (const s of ancestors(state, tip)) {
    for (const p of parts(state.commits[s].change)) {
      const base = p.replace(/^-/, '')
      net.set(base, (net.get(base) ?? 0) + (p.startsWith('-') ? -1 : 1))
    }
  }
  return net
}

/** Can `change` be applied on top of `tip`? An add applies when it isn't in effect, a removal when it is. */
export function canApply(state: RepoState, tip: Sha, change: string): boolean {
  const net = netChanges(state, tip)
  return parts(change).every((p) => {
    const n = net.get(p.replace(/^-/, '')) ?? 0
    return p.startsWith('-') ? n > 0 : n <= 0
  })
}

/** What a merge brought in relative to one of its parents, as a change (what `git revert -m` undoes). */
export function mergeChange(state: RepoState, merge: Sha, mainline: Sha): string {
  const [after, before] = [netChanges(state, merge), netChanges(state, mainline)]
  const out: string[] = []
  for (const base of new Set([...after.keys(), ...before.keys()])) {
    const [a, b] = [(after.get(base) ?? 0) > 0, (before.get(base) ?? 0) > 0]
    if (a && !b) out.push(base)
    if (!a && b) out.push(`-${base}`)
  }
  return out.sort().join(' ')
}

/** Commits in `a..b`: reachable from b but not from a, oldest first. */
export function range(state: RepoState, a: Sha, b: Sha): Sha[] {
  const exclude = ancestors(state, a)
  return [...ancestors(state, b)].filter((s) => !exclude.has(s)).sort((x, y) => state.commits[x].seq - state.commits[y].seq)
}
