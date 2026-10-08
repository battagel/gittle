import { fail } from './errors'
import { makeSha } from './sha'
import { isValidRefName } from './refs'
import type { Commit, Effect, Head, OutputLine, RepoState, RunOptions, Sha } from './state'

/** Collects output and effects while a command mutates its draft state. */
export class Ctx {
  output: OutputLine[] = []
  effects: Effect[] = []
  readonly state: RepoState
  readonly opts: RunOptions
  /** What the current command is doing, in git's reflog wording. Every ref it moves gets an entry with this. */
  reason = ''

  constructor(state: RepoState, opts: RunOptions) {
    this.state = state
    this.opts = opts
  }

  info(text: string) {
    this.output.push({ kind: 'info', text })
  }

  hint(text: string) {
    this.output.push({ kind: 'hint', text })
  }

  effect(e: Effect) {
    this.effects.push(e)
  }
}

export function createRepo(seed = 'gittle', opts: { origin?: boolean } = {}): RepoState {
  const state: RepoState = {
    commits: {},
    branches: {},
    tags: {},
    head: { type: 'branch', name: 'main' },
    previous: null,
    origin: null,
    remoteTracking: {},
    upstream: {},
    annotated: {},
    reflogs: {},
    bisect: null,
    bisected: null,
    bug: null,
    nextNumber: 0,
    seed,
  }
  state.branches.main = newCommit(state, []).sha
  state.reflogs.HEAD = [{ sha: state.branches.main, message: 'commit (initial): C0' }]
  state.reflogs.main = [{ sha: state.branches.main, message: 'commit (initial): C0' }]
  if (opts.origin) {
    // as if freshly cloned: origin/main == main, and main tracks it
    state.origin = { branches: { main: state.branches.main }, tags: {}, pullRequests: 0, protected: [] }
    state.remoteTracking.main = state.branches.main
    state.upstream.main = 'main'
  }
  return state
}

export function headSha(state: RepoState): Sha {
  return state.head.type === 'branch' ? state.branches[state.head.name] : state.head.sha
}

export function currentBranch(state: RepoState): string | null {
  return state.head.type === 'branch' ? state.head.name : null
}

function addCommit(state: RepoState, label: string, parents: Sha[], change: string, message: string, local = true): Commit {
  const commit: Commit = {
    sha: makeSha(state, label, parents),
    label,
    parents,
    change,
    message,
    local,
    seq: Object.keys(state.commits).length,
  }
  state.commits[commit.sha] = commit
  return commit
}

/** A brand-new commit with a fresh "C<n>" label. Its change is its own label unless given (reverts). */
export function newCommit(
  state: RepoState,
  parents: Sha[],
  opts: { change?: string; message?: string; local?: boolean } = {},
): Commit {
  const label = `C${state.nextNumber++}`
  return addCommit(state, label, parents, opts.change ?? label, opts.message ?? label, opts.local ?? true)
}

/** Copy a commit's change onto a new parent (cherry-pick / rebase). C4 -> C4', then C4''... */
export function copyCommit(state: RepoState, original: Commit, parent: Sha, local = true): Commit {
  const taken = new Set(Object.values(state.commits).map((c) => c.label))
  let label = `${original.label}'`
  while (taken.has(label)) label += "'"
  return addCommit(state, label, [parent], original.change, original.message, local)
}

/** Add a reflog entry for a ref ("HEAD" or a branch). */
export function logRef(state: RepoState, ref: string, sha: Sha, message: string) {
  ;(state.reflogs[ref] ??= []).push({ sha, message })
}

/** Move whatever HEAD points at (the current branch, or HEAD itself when detached) to `sha`. */
export function setHead(ctx: Ctx, sha: Sha) {
  const s = ctx.state
  if (s.head.type === 'branch') {
    if (s.branches[s.head.name] === sha) return
    moveBranch(ctx, s.head.name, sha)
  } else {
    if (s.head.sha === sha) return
    const from = s.head
    s.head = { type: 'detached', sha }
    ctx.effect({ type: 'move-head', from, to: s.head })
  }
  logRef(s, 'HEAD', sha, ctx.reason)
}

export function moveBranch(ctx: Ctx, name: string, to: Sha | null) {
  const from = ctx.state.branches[name] ?? null
  if (from === to) return
  if (to === null) {
    delete ctx.state.branches[name]
    delete ctx.state.reflogs[name]
  } else {
    ctx.state.branches[name] = to
    logRef(ctx.state, name, to, ctx.reason)
  }
  ctx.effect({ type: 'move-ref', kind: 'branch', name, from, to })
}

export function moveTag(ctx: Ctx, name: string, to: Sha | null) {
  const from = ctx.state.tags[name] ?? null
  if (from === to) return
  if (to === null) delete ctx.state.tags[name]
  else ctx.state.tags[name] = to
  ctx.effect({ type: 'move-ref', kind: 'tag', name, from, to })
}

/** Move a remote-tracking ref (origin/<name>). */
export function moveRemote(ctx: Ctx, name: string, to: Sha | null) {
  const from = ctx.state.remoteTracking[name] ?? null
  if (from === to) return
  if (to === null) delete ctx.state.remoteTracking[name]
  else ctx.state.remoteTracking[name] = to
  ctx.effect({ type: 'move-ref', kind: 'remote', name, from, to })
}

/** Point HEAD somewhere else (switch/checkout). Logged even when it doesn't move, as git does. */
export function moveHead(ctx: Ctx, to: Head) {
  const from = ctx.state.head
  ctx.state.head = to
  logRef(ctx.state, 'HEAD', headSha(ctx.state), ctx.reason)
  ctx.effect({ type: 'move-head', from, to })
}

/** How git names where HEAD is, in "checkout: moving from X to Y". */
export function headLabel(state: RepoState): string {
  return state.head.type === 'branch' ? state.head.name : state.head.sha
}

export function createBranch(ctx: Ctx, name: string, sha: Sha, force = false) {
  if (!isValidRefName(name)) fail(`fatal: '${name}' is not a valid branch name`)
  if (ctx.state.branches[name] && !force) fail(`fatal: a branch named '${name}' already exists`)
  if (force && currentBranch(ctx.state) === name) fail(`fatal: cannot force update the branch '${name}' used by HEAD`)
  moveBranch(ctx, name, sha)
}

/** "main", or "HEAD" when detached — as git shows in `[main abc1234] ...` lines. */
export function headName(state: RepoState): string {
  return currentBranch(state) ?? 'detached HEAD'
}

/** Identifies a repo state by HEAD, refs and every commit with its change (shas alone don't encode the change). */
const remoteParts = (s: RepoState) => [
  s.origin && [Object.entries(s.origin.branches).sort(), Object.entries(s.origin.tags).sort(), [...s.origin.protected].sort()],
  Object.entries(s.remoteTracking).sort(),
  Object.entries(s.upstream).sort(),
]

/** Identifies a repo state by HEAD, refs (local, remote-tracking and the server's) and every commit with its change. */
export function stateKey(s: RepoState): string {
  return JSON.stringify([
    s.head,
    Object.entries(s.branches).sort(),
    Object.entries(s.tags).sort(),
    ...remoteParts(s),
    Object.values(s.commits).map((c) => `${c.sha}:${c.change}:${c.local ? 1 : 0}`).sort(),
  ])
}

/** Structural equality: refs, HEAD, the remote and the set of commits. Decides whether a command was a stroke. */
export function sameRepo(a: RepoState, b: RepoState): boolean {
  const key = (s: RepoState) =>
    JSON.stringify([
      s.head,
      Object.entries(s.branches).sort(),
      Object.entries(s.tags).sort(),
      ...remoteParts(s),
      Object.keys(s.commits).length,
      Object.values(s.commits).filter((c) => c.local).length,
    ])
  return key(a) === key(b)
}
