import { headSha, type RepoState, type Sha } from '../engine'
import { ancestors, canApply, isAncestor, netChanges, parts } from '../engine/graph'

// A level's goal is a list of checks: what the level is about, not one exact graph.
// Extra work costs strokes, not the win. Changes are matched by change (so copies count), refs by name.
// Commits are named by their label in the level's start state (C2): that exact original commit.

export type Check =
  | { type: 'head'; branch: string } // a branch name, or "detached"
  | { type: 'points-to'; kind: 'branch' | 'tag' | 'ref'; ref: string; commit: string }
  | { type: 'same'; refs: string[] }
  | { type: 'ahead'; ref: string; of: string; by?: number }
  | { type: 'merged'; from: string; into: string }
  | { type: 'on-top-of'; ref: string; base: string }
  | { type: 'contains' | 'excludes' | 'applied' | 'not-applied'; ref: string; changes: string[] }
  | { type: 'linear' | 'merge-commit' | 'unchanged' | 'no-duplicates' | 'absent'; ref: string }
  | { type: 'pushed' | 'in-sync'; ref: string } // a local branch vs origin
  | { type: 'tracks'; branch: string; upstream: string }

export interface GoalLevel {
  start: RepoState
  goal: Check[]
}

const isLabel = (ref: string) => /^C\d+'*$/.test(ref)

/** The commit a ref names: HEAD, a branch, a tag, or a label from the level's start. */
function tip(level: GoalLevel, state: RepoState, ref: string): Sha | null {
  if (ref === 'HEAD') return headSha(state)
  if (ref.startsWith('tags/')) return state.tags[ref.slice(5)] ?? null
  if (ref.startsWith('origin:')) return state.origin?.branches[ref.slice(7)] ?? null // the server's own branch
  if (ref.startsWith('origin/') && !state.branches[ref]) return state.remoteTracking[ref.slice(7)] ?? null
  if (ref.startsWith('heads/')) return state.branches[ref.slice(6)] ?? null
  if (state.branches[ref]) return state.branches[ref]
  if (state.tags[ref]) return state.tags[ref]
  if (isLabel(ref)) return Object.values(level.start.commits).find((c) => c.label === ref)?.sha ?? null
  return null
}

function historyChanges(state: RepoState, sha: Sha): Set<string> {
  return new Set([...ancestors(state, sha)].flatMap((s) => parts(state.commits[s].change)))
}

export function passes(level: GoalLevel, state: RepoState, check: Check): boolean {
  const t = (ref: string) => tip(level, state, ref)
  switch (check.type) {
    case 'head':
      return check.branch === 'detached'
        ? state.head.type === 'detached'
        : state.head.type === 'branch' && state.head.name === check.branch
    case 'points-to': {
      const a =
        check.kind === 'branch' ? state.branches[check.ref] : check.kind === 'tag' ? state.tags[check.ref] : t(check.ref)
      return a !== undefined && a !== null && a === t(check.commit)
    }
    case 'same': {
      const tips = check.refs.map(t)
      return tips.every((s) => s !== null && s === tips[0])
    }
    case 'ahead': {
      const [ref, of] = [t(check.ref), t(check.of)]
      if (!ref || !of || ref === of || !isAncestor(state, of, ref)) return false
      const extra = ancestors(state, ref).size - ancestors(state, of).size
      return check.by === undefined || extra === check.by
    }
    case 'merged':
    case 'on-top-of': {
      const [inner, outer] = check.type === 'merged' ? [check.from, check.into] : [check.base, check.ref]
      const [a, b] = [t(inner), t(outer)]
      return a !== null && b !== null && isAncestor(state, a, b)
    }
    case 'contains':
    case 'excludes': {
      const ref = t(check.ref)
      if (!ref) return false
      const changes = historyChanges(state, ref)
      return check.changes.every((c) => changes.has(c) === (check.type === 'contains'))
    }
    case 'applied':
    case 'not-applied': {
      const ref = t(check.ref)
      // a change is in effect when it could not be applied again
      return ref !== null && check.changes.every((c) => !canApply(state, ref, c) === (check.type === 'applied'))
    }
    case 'linear': {
      const ref = t(check.ref)
      return ref !== null && [...ancestors(state, ref)].every((s) => state.commits[s].parents.length < 2)
    }
    case 'merge-commit': {
      const ref = t(check.ref)
      return ref !== null && state.commits[ref].parents.length > 1
    }
    case 'no-duplicates': {
      // a change in effect twice (C2 and its copy C2') is the classic sign of a rebased branch merged back in;
      // re-applying something that was reverted is fine
      const ref = t(check.ref)
      return ref !== null && [...netChanges(state, ref).values()].every((n) => n <= 1)
    }
    case 'absent':
      return state.branches[check.ref] === undefined && state.tags[check.ref] === undefined
    case 'pushed': {
      const sha = state.branches[check.ref]
      return sha !== undefined && state.origin?.branches[check.ref] === sha
    }
    case 'in-sync': {
      const sha = state.branches[check.ref]
      return sha !== undefined && state.remoteTracking[check.ref] === sha && state.origin?.branches[check.ref] === sha
    }
    case 'tracks':
      return state.upstream[check.branch] === check.upstream.replace(/^origin\//, '')
    case 'unchanged': {
      const ref = t(check.ref)
      return ref !== null && ref === tip(level, level.start, check.ref)
    }
  }
}

export function isSolved(level: GoalLevel, state: RepoState): boolean {
  return level.goal.every((check) => passes(level, state, check))
}

/** Every check with a plain-English description and whether it currently passes. */
export function evaluate(level: GoalLevel, state: RepoState): { text: string; ok: boolean }[] {
  return level.goal.map((check) => ({ text: describe(check), ok: passes(level, state, check) }))
}

const name = (ref: string) =>
  isLabel(ref)
    ? ref
    : ref.startsWith('tags/')
      ? `tag \`${ref.slice(5)}\``
      : ref.startsWith('origin:')
        ? `\`${ref.slice(7)}\` on origin`
        : `\`${ref.replace(/^heads\//, '')}\``
const list = (items: string[], joiner: string) =>
  items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}`

export function describe(check: Check): string {
  switch (check.type) {
    case 'head':
      return check.branch === 'detached' ? 'HEAD is detached' : `HEAD is on ${name(check.branch)}`
    case 'points-to':
      return `${check.kind === 'ref' ? '' : `${check.kind} `}${name(check.ref)} points at ${name(check.commit)}`
    case 'same':
      return `${list(check.refs.map(name), 'and')} point at the same commit`
    case 'ahead':
      return `${name(check.ref)} is ahead of ${name(check.of)}${check.by ? ` by ${check.by}` : ''}`
    case 'merged':
      return `${name(check.from)} is merged into ${name(check.into)}`
    case 'on-top-of':
      return `${name(check.ref)} is built on top of ${name(check.base)}`
    case 'contains':
      return `${name(check.ref)} includes ${list(check.changes, 'and')}`
    case 'excludes':
      return `${name(check.ref)} doesn't include ${list(check.changes, 'or')}`
    case 'applied':
      return `${list(check.changes, 'and')} ${check.changes.length > 1 ? 'are' : 'is'} in effect on ${name(check.ref)}`
    case 'not-applied':
      return `${list(check.changes, 'and')} ${check.changes.length > 1 ? 'are' : 'is'} undone on ${name(check.ref)}`
    case 'linear':
      return `${name(check.ref)} has no merge commits`
    case 'merge-commit':
      return `${name(check.ref)} ends in a merge commit`
    case 'no-duplicates':
      return `${name(check.ref)} doesn't contain the same change twice`
    case 'absent':
      return `${name(check.ref)} is deleted`
    case 'pushed':
      return `${name(check.ref)} is pushed to origin`
    case 'in-sync':
      return `${name(check.ref)} is in sync with origin`
    case 'tracks':
      return `${name(check.branch)} tracks \`origin/${check.upstream.replace(/^origin\//, '')}\``
    case 'unchanged':
      return `${name(check.ref)} hasn't moved`
  }
}

// --- parsing -------------------------------------------------------------------------------------

const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || !v) throw new Error(`${what} must be a string`)
  return v
}
const strs = (v: unknown, what: string): string[] => {
  if (!Array.isArray(v) || !v.length) throw new Error(`${what} must be a non-empty list`)
  return v.map((x, i) => str(x, `${what}[${i}]`))
}
const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${what} must be a mapping`)
  return v as Record<string, unknown>
}

/** Parse one YAML goal item, e.g. `{ ahead: { ref: feature, of: main } }`. */
export function parseCheck(raw: unknown, i: number): Check {
  const entries = Object.entries(obj(raw, `goal[${i}]`))
  if (entries.length !== 1) throw new Error(`goal[${i}] must have exactly one check`)
  const [type, v] = entries[0]
  const at = `goal[${i}].${type}`
  switch (type) {
    case 'head':
      return { type, branch: str(v, at) }
    case 'linear':
    case 'merge-commit':
    case 'unchanged':
    case 'no-duplicates':
    case 'absent':
    case 'pushed':
    case 'in-sync':
      return { type, ref: str(v, at) }
    case 'tracks': {
      const o = obj(v, at)
      return { type, branch: str(o.branch, `${at}.branch`), upstream: str(o.upstream, `${at}.upstream`) }
    }
    case 'same':
      return { type, refs: strs(v, at) }
    case 'points-to': {
      // { branch: x } or { tag: x } insists on that kind of ref; { ref: x } accepts any (including HEAD)
      const o = obj(v, at)
      const kinds = (['branch', 'tag', 'ref'] as const).filter((k) => o[k] !== undefined)
      if (kinds.length !== 1) throw new Error(`${at} needs exactly one of branch, tag or ref`)
      return { type, kind: kinds[0], ref: str(o[kinds[0]], `${at}.${kinds[0]}`), commit: str(o.commit, `${at}.commit`) }
    }
    case 'ahead': {
      const o = obj(v, at)
      if (o.by !== undefined && (!Number.isInteger(o.by) || (o.by as number) < 1)) throw new Error(`${at}.by must be a positive integer`)
      return { type, ref: str(o.ref, `${at}.ref`), of: str(o.of, `${at}.of`), by: o.by as number | undefined }
    }
    case 'merged': {
      const o = obj(v, at)
      return { type, from: str(o.from, `${at}.from`), into: str(o.into, `${at}.into`) }
    }
    case 'on-top-of': {
      const o = obj(v, at)
      return { type, ref: str(o.ref, `${at}.ref`), base: str(o.base, `${at}.base`) }
    }
    case 'contains':
    case 'excludes':
    case 'applied':
    case 'not-applied': {
      const o = obj(v, at)
      return { type, ref: str(o.ref, `${at}.ref`), changes: strs(o.changes, `${at}.changes`) }
    }
  }
  throw new Error(`goal[${i}]: unknown check "${type}"`)
}

/** Every ref and change a check mentions, so the loader can catch typos. */
export function mentions(check: Check): { refs: string[]; changes: string[] } {
  switch (check.type) {
    case 'head':
      return { refs: check.branch === 'detached' ? [] : [check.branch], changes: [] }
    case 'points-to':
      return { refs: [check.ref, check.commit], changes: [] }
    case 'same':
      return { refs: check.refs, changes: [] }
    case 'ahead':
      return { refs: [check.ref, check.of], changes: [] }
    case 'merged':
      return { refs: [check.from, check.into], changes: [] }
    case 'on-top-of':
      return { refs: [check.ref, check.base], changes: [] }
    case 'contains':
    case 'excludes':
    case 'applied':
    case 'not-applied':
      return { refs: [check.ref], changes: check.changes }
    case 'linear':
    case 'merge-commit':
    case 'unchanged':
    case 'no-duplicates':
    case 'absent':
    case 'pushed':
    case 'in-sync':
      return { refs: [check.ref], changes: [] }
    case 'tracks':
      return { refs: [check.branch], changes: [] }
  }
}
