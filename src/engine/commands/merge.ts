import { fail } from '../errors'
import { isAncestor } from '../graph'
import { parseArgs } from '../parse'
import { resolve } from '../refs'
import { type Ctx, currentBranch, headSha, newCommit, setHead } from '../repo'
import type { Sha } from '../state'

export function merge(ctx: Ctx, args: string[]) {
  const { flags, options, positional } = parseArgs(args, {
    flags: { '--no-ff': 'no-ff', '--ff': 'ff', '--ff-only': 'ff-only', '--no-edit': 'no-edit' },
    options: { '-m': 'message' },
  })
  if (!positional.length) fail('fatal: no merge target given', 'Try: git merge <branch>')
  if (positional.length > 1) fail("fatal: gittle can't do octopus merges (yet). Merge one branch at a time.")

  const s = ctx.state
  const name = positional[0]
  const what = s.branches[name] ? 'branch' : s.tags[name] ? 'tag' : name.startsWith('origin/') ? 'remote-tracking branch' : 'commit'
  const target = resolve(s, name, ctx.opts)
  mergeInto(ctx, target, {
    noFF: flags.has('no-ff'),
    ffOnly: flags.has('ff-only'),
    message: options.message?.trim() || `Merge ${what} '${what === 'commit' ? target : name}'`,
    addInto: !options.message?.trim(),
  })
}

/** Merge `target` into HEAD: nothing to do, fast-forward, or a merge commit. Shared with `git pull`. */
export function mergeInto(
  ctx: Ctx,
  target: Sha,
  opts: { noFF?: boolean; ffOnly?: boolean; message: string; addInto?: boolean },
) {
  const s = ctx.state
  const head = headSha(s)
  if (isAncestor(s, target, head)) {
    ctx.info('Already up to date.')
    return
  }
  if (isAncestor(s, head, target) && !opts.noFF) {
    setHead(ctx, target)
    ctx.info(`Updating ${head}..${target}`)
    ctx.info('Fast-forward')
    return
  }
  if (opts.ffOnly) fail('fatal: Not possible to fast-forward, aborting.')

  const into = opts.addInto && currentBranch(s) && currentBranch(s) !== 'main' ? ` into ${currentBranch(s)}` : ''
  const c = newCommit(s, [head, target], { change: '', message: opts.message + into })
  ctx.effect({ type: 'merge', sha: c.sha })
  setHead(ctx, c.sha)
  ctx.info("Merge made by the 'ort' strategy.")
}
