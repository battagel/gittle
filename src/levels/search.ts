import { run, stateKey, type RepoState } from '../engine'
import { isAncestor } from '../engine/graph'
import { isSolved } from './goal'
import type { Level } from './load'
import { specialFeature } from './special'

// Brute-force search over every plausible command, used to prove par is optimal and to audit goals for loopholes.

/**
 * Every reasonable command from `state`. Commits are named by sha only: a branch name pointing at the same commit
 * gives the same result, so trying both would just double the work.
 */
export function candidates(state: RepoState, level: Level): string[] {
  const branches = Object.keys(state.branches)
  const shas = Object.keys(state.commits).filter((s) => state.commits[s].local) // you can't name what you haven't fetched
  const newNames = [...Object.keys(level.target.branches), ...Object.keys(level.target.tags)].filter(
    (n) => !state.branches[n] && !state.tags[n],
  )
  const cmds = ['git commit']
  for (const b of branches) cmds.push(`git switch ${b}`, `git branch -D ${b}`, `git branch -d ${b}`)
  for (const a of branches) for (const b of branches) if (a < b) cmds.push(`git branch -d ${a} ${b}`, `git branch -D ${a} ${b}`)
  for (const t of Object.keys(state.tags)) cmds.push(`git tag -d ${t}`)
  for (const r of shas) {
    cmds.push(
      `git switch --detach ${r}`,
      `git merge ${r}`,
      `git merge --no-ff ${r}`,
      `git rebase ${r}`,
      `git cherry-pick ${r}`,
      `git reset --hard ${r}`,
      `git revert ${r}`,
    )
    if (state.commits[r].parents.length > 1) cmds.push(`git revert -m 1 ${r}`, `git revert -m 2 ${r}`)
    for (const b of branches) cmds.push(`git branch -f ${b} ${r}`, `git rebase ${r} ${b}`)
    for (const n of newNames) cmds.push(`git switch -c ${n} ${r}`, `git branch ${n} ${r}`, `git tag ${n} ${r}`)
  }
  // remotes
  if (state.origin) {
    cmds.push('git fetch', 'git pull', 'git pull --rebase', 'git pull --no-rebase', 'git push', 'git push --force-with-lease', 'git push --force')
    for (const b of branches) cmds.push(`git push -u origin ${b}`, `git push --force origin ${b}`)
    for (const b of Object.keys(state.origin.branches)) cmds.push(`git push origin --delete ${b}`)
  }
  for (const a of shas) {
    for (const b of shas) {
      if (a === b) continue
      // several commits at once, and ranges
      cmds.push(`git cherry-pick ${a} ${b}`, `git revert ${a} ${b}`)
      if (isAncestor(state, a, b)) cmds.push(`git cherry-pick ${a}..${b}`, `git revert ${a}..${b}`)
      // rebase --onto <a> <b>, for the current branch or any branch
      cmds.push(`git rebase --onto ${a} ${b}`)
      for (const br of branches) cmds.push(`git rebase --onto ${a} ${b} ${br}`)
    }
  }
  return cmds
}

export interface SearchResult {
  routes: string[][] // one per distinct winning end state, shortest first
  depth: number // every route up to this many strokes was tried
}

/**
 * Breadth-first search for winning routes of at most `maxDepth` strokes. Repeated states are explored once.
 * Stops early after `limit` routes, or when the next depth would exceed `budget` command runs.
 */
export function search(
  level: Level,
  maxDepth: number,
  limit = Infinity,
  budget = 3_000_000,
  opts: { basic?: boolean } = {},
): SearchResult {
  const moves = (state: RepoState) => {
    const all = candidates(state, level)
    return opts.basic ? all.filter((c) => !specialFeature(c)) : all
  }
  const routes: string[][] = []
  const seen = new Set([stateKey(level.start)])
  let frontier: { state: RepoState; path: string[] }[] = [{ state: level.start, path: [] }]
  let runs = 0
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    // estimate this depth's cost from the frontier size; give up cleanly rather than run for ages
    const estimate = frontier.length * moves(frontier[0].state).length
    if (runs + estimate > budget) return { routes, depth: depth - 1 }
    const next: typeof frontier = []
    for (const { state, path } of frontier) {
      for (const cmd of moves(state)) {
        runs++
        const r = run(state, cmd)
        if (!r.changed) continue
        const k = stateKey(r.state)
        if (seen.has(k)) continue
        seen.add(k)
        if (isSolved(level, r.state)) {
          routes.push([...path, cmd])
          if (routes.length >= limit) return { routes, depth }
        } else {
          next.push({ state: r.state, path: [...path, cmd] })
        }
      }
    }
    frontier = next
  }
  return { routes, depth: maxDepth }
}

/** Swap shas back to labels so routes are readable. */
export function readable(level: Level, route: string[]): string {
  let state = level.start
  return route
    .map((cmd) => {
      const shown = cmd.replace(/\b[0-9a-f]{7}\b/g, (sha) => state.commits[sha]?.label ?? sha)
      state = run(state, cmd).state
      return shown
    })
    .join('  →  ')
}
