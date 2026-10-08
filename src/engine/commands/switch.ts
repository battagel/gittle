import { fail } from '../errors'
import { parseArgs } from '../parse'
import { resolve, tryResolve } from '../refs'
import { type Ctx, createBranch, currentBranch, moveHead } from '../repo'
import { setUpstream, trackIfRemote } from './remote'

// `record`: switch/checkout remember where they came from (for `git switch -`), even when already there.
// Rebase switches branches without recording, as in git.
export function attach(ctx: Ctx, name: string, created = false, record = true) {
  if (record) ctx.state.previous = ctx.state.head
  if (currentBranch(ctx.state) === name && !created) {
    ctx.info(`Already on '${name}'`)
    return
  }
  moveHead(ctx, { type: 'branch', name })
  ctx.info(created ? `Switched to a new branch '${name}'` : `Switched to branch '${name}'`)
}

export function detach(ctx: Ctx, sha: string, record = true) {
  if (record) ctx.state.previous = ctx.state.head
  moveHead(ctx, { type: 'detached', sha })
  ctx.info(`HEAD is now at ${sha}`)
  ctx.hint("You are in 'detached HEAD' state. To keep commits you make here, create a branch: git switch -c <name>")
}

/** `git switch feature` with only origin/feature: create a local branch tracking it (git's "DWIM"). */
export function dwim(ctx: Ctx, name: string) {
  createBranch(ctx, name, ctx.state.remoteTracking[name])
  setUpstream(ctx, name, `origin/${name}`)
  attach(ctx, name, true)
}

/** Where `-` (@{-1}) points: the previous branch, or the commit HEAD was detached at. */
export function previous(ctx: Ctx): { branch: string } | { sha: string } {
  const prev = ctx.state.previous
  if (!prev || (prev.type === 'branch' && !ctx.state.branches[prev.name])) fail('fatal: invalid reference: @{-1}')
  return prev.type === 'branch' ? { branch: prev.name } : { sha: prev.sha }
}

export function switchCmd(ctx: Ctx, args: string[]) {
  const { flags, options, positional } = parseArgs(args, {
    flags: { '--detach': 'detach', '-d': 'detach' },
    options: { '-c': 'create', '--create': 'create', '-C': 'force-create', '--force-create': 'force-create' },
  })
  const s = ctx.state
  if (positional.length > 1) fail('fatal: only one reference expected')

  const create = options.create ?? options['force-create']
  if (create) {
    createBranch(ctx, create, resolve(s, positional[0] ?? 'HEAD', ctx.opts), 'force-create' in options)
    trackIfRemote(ctx, create, positional[0] ?? 'HEAD')
    attach(ctx, create, true)
    return
  }

  if (flags.has('detach')) {
    detach(ctx, resolve(s, positional[0] ?? 'HEAD', ctx.opts))
    return
  }

  const target = positional[0]
  if (!target) fail('fatal: missing branch or commit argument')
  if (target === '-' || target === '@{-1}') {
    const prev = previous(ctx)
    if ('sha' in prev) {
      fail(`fatal: a branch is expected, got commit '${prev.sha}'`, 'To go back to that commit, use: git switch --detach -')
    }
    attach(ctx, prev.branch)
    return
  }
  if (s.branches[target]) {
    attach(ctx, target)
  } else if (s.remoteTracking[target] !== undefined) {
    dwim(ctx, target)
  } else if (tryResolve(s, target, ctx.opts)) {
    fail(`fatal: a branch is expected, got commit '${target}'`, `To look at a commit without a branch, use: git switch --detach ${target}`)
  } else {
    fail(`fatal: invalid reference: ${target}`)
  }
}
