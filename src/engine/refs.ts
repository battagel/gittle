import { fail } from './errors'
import { range } from './graph'
import { fullSha } from './sha'
import type { RepoState, RunOptions, Sha } from './state'

/**
 * Resolve a revision: HEAD/@, branch, tag, (label when allowed), or sha prefix (4+ chars),
 * followed by any number of ~n / ^n suffixes.
 */
export function resolve(state: RepoState, rev: string, opts: RunOptions = {}): Sha {
  const sha = tryResolve(state, rev, opts)
  if (!sha) fail(`fatal: bad revision '${rev}'`)
  return sha
}

export function tryResolve(state: RepoState, rev: string, opts: RunOptions = {}): Sha | null {
  if (rev === '-') rev = '@{-1}' // merge/rebase/cherry-pick accept "-" for the previous branch, like git
  const m = /^(.*?)((?:[~^]\d*)*)$/.exec(rev)!
  let sha = resolveBase(state, m[1], opts)
  if (!sha) return null

  for (const [, op, digits] of m[2].matchAll(/([~^])(\d*)/g)) {
    const n = digits === '' ? 1 : Number(digits)
    if (op === '~') {
      for (let i = 0; i < n && sha; i++) sha = state.commits[sha].parents[0] ?? null
    } else if (n > 0) {
      sha = state.commits[sha].parents[n - 1] ?? null
    }
    if (!sha) return null
  }
  return sha
}

function resolveBase(state: RepoState, base: string, opts: RunOptions): Sha | null {
  if (base === '@{-1}') {
    const prev = state.previous
    if (!prev) return null
    return prev.type === 'branch' ? (state.branches[prev.name] ?? null) : prev.sha
  }
  if (base === 'HEAD' || base === '@') {
    return state.head.type === 'branch' ? state.branches[state.head.name] : state.head.sha
  }
  const at = /^(.*)@\{(\d+)\}$/.exec(base)
  if (at) {
    // HEAD@{2}, main@{1}, @{1} (the current branch): where that ref was n moves ago
    const ref = at[1] === '' ? (state.head.type === 'branch' ? state.head.name : 'HEAD') : at[1]
    const log = state.reflogs[ref]
    if (!log) return null
    return log[log.length - 1 - Number(at[2])]?.sha ?? null
  }
  if (base === '@{u}' || base === '@{upstream}') {
    const b = state.head.type === 'branch' ? state.upstream[state.head.name] : undefined
    return b === undefined ? null : (state.remoteTracking[b] ?? null)
  }
  if (state.branches[base]) return state.branches[base]
  if (state.tags[base]) return state.tags[base]
  if (base.startsWith('origin/') && state.remoteTracking[base.slice(7)]) return state.remoteTracking[base.slice(7)]
  if (opts.labels) {
    const byLabel = Object.values(state.commits).find((c) => c.label === base)
    if (byLabel) return byLabel.sha
  }
  if (/^[0-9a-f]{4,40}$/.test(base)) {
    const matches = Object.keys(state.commits).filter(
      (s) => (state.commits[s].local || opts.labels) && fullSha(state, s).startsWith(base),
    )
    if (matches.length > 1) fail(`error: short object ID ${base} is ambiguous`)
    if (matches.length === 1) return matches[0]
  }
  return null
}

/** One commit, or every commit in an "A..B" range (oldest first). */
export function resolveMany(state: RepoState, arg: string, opts: RunOptions = {}): Sha[] {
  const m = /^(.*?)\.\.(?!\.)(.*)$/.exec(arg)
  if (!m) return [resolve(state, arg, opts)]
  const [a, b] = [resolve(state, m[1] || 'HEAD', opts), resolve(state, m[2] || 'HEAD', opts)]
  return range(state, a, b)
}

const validName = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*[/.]$)[A-Za-z0-9._/-]+$/

export function isValidRefName(name: string): boolean {
  return validName.test(name) && name !== 'HEAD' && name !== '@'
}
