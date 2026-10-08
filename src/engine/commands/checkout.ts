import { fail } from '../errors'
import { parseArgs } from '../parse'
import { resolve, tryResolve } from '../refs'
import { type Ctx, createBranch } from '../repo'
import { trackIfRemote } from './remote'
import { attach, detach, dwim, previous } from './switch'

export function checkout(ctx: Ctx, args: string[]) {
  const { flags, options, positional } = parseArgs(args, {
    flags: { '--detach': 'detach' },
    options: { '-b': 'create', '-B': 'force-create' },
  })
  const s = ctx.state
  if (positional.length > 1) fail('fatal: only one reference expected')

  const create = options.create ?? options['force-create']
  if (create) {
    ctx.reason = `branch: Created from ${ctx.typed(positional[0] ?? 'HEAD')}`
    createBranch(ctx, create, resolve(s, positional[0] ?? 'HEAD', ctx.opts), 'force-create' in options)
    trackIfRemote(ctx, create, positional[0] ?? 'HEAD')
    attach(ctx, create, true)
    return
  }

  const target = positional[0]
  if (!target) fail('fatal: you must specify a branch or commit to check out')
  if ((target === '-' || target === '@{-1}') && !flags.has('detach')) {
    const prev = previous(ctx)
    if ('branch' in prev) attach(ctx, prev.branch)
    else detach(ctx, prev.sha)
    return
  }
  if (s.branches[target] && !flags.has('detach')) {
    attach(ctx, target)
    return
  }
  if (!flags.has('detach') && s.remoteTracking[target] !== undefined && tryResolve(s, target, ctx.opts) === null) {
    dwim(ctx, target)
    return
  }
  const sha = tryResolve(s, target, ctx.opts)
  if (!sha) fail(`error: pathspec '${target}' did not match any file(s) known to git`)
  detach(ctx, sha, true, target)
}
