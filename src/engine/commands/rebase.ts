import { fail } from '../errors'
import { ancestors, canApply, isAncestor } from '../graph'
import { parseArgs } from '../parse'
import { resolve } from '../refs'
import { type Ctx, copyCommit, currentBranch, headSha, setHead } from '../repo'
import type { Sha } from '../state'
import { attach, detach } from './switch'

export function rebase(ctx: Ctx, args: string[]) {
  const { options, positional } = parseArgs(args, { options: { '--onto': 'onto' } })
  if (!positional.length) fail('fatal: no upstream given', 'Try: git rebase <branch>')
  if (positional.length > 2) fail('fatal: too many arguments')

  const s = ctx.state
  const upstream = resolve(s, positional[0], ctx.opts)
  // --onto: replay the commits after <upstream> onto a different base
  const onto = options.onto === undefined ? null : resolve(s, options.onto, ctx.opts)

  // `git rebase <upstream> <branch>` switches to <branch> first.
  if (positional[1]) {
    const b = positional[1]
    if (s.branches[b]) {
      if (currentBranch(s) !== b) attach(ctx, b, false, false)
    } else {
      detach(ctx, resolve(s, b, ctx.opts), false)
    }
  }

  replayOnto(ctx, upstream, onto)
}

/** Replay HEAD's commits that aren't in `upstream` onto `onto` (default: upstream). Shared with `git pull --rebase`. */
export function replayOnto(ctx: Ctx, upstream: Sha, onto: Sha | null = null) {
  const s = ctx.state
  const head = headSha(s)
  const name = currentBranch(s) ?? 'HEAD'
  if (onto === null && isAncestor(s, upstream, head)) {
    ctx.info(`Current branch ${name} is up to date.`)
    return
  }

  // Commits on our side only, oldest first; merge commits are dropped, as git does by default.
  const upstreamSet = ancestors(s, upstream)
  const toCopy = [...ancestors(s, head)]
    .filter((sha) => !upstreamSet.has(sha))
    .map((sha) => s.commits[sha])
    .filter((c) => c.parents.length < 2)
    .sort((a, b) => a.seq - b.seq)

  let tip = onto ?? upstream
  for (const original of toCopy) {
    if (!canApply(s, tip, original.change)) {
      ctx.info(`dropping ${original.sha} ${original.label} -- patch contents already upstream`)
      continue
    }
    const copy = copyCommit(s, original, tip)
    ctx.effect({ type: 'copy', from: original.sha, to: copy.sha })
    tip = copy.sha
  }
  setHead(ctx, tip)
  ctx.info(`Successfully rebased and updated ${name === 'HEAD' ? 'detached HEAD' : `refs/heads/${name}`}.`)
}
