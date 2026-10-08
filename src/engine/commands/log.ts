import { fail } from '../errors'
import { ancestors } from '../graph'
import { parseArgs } from '../parse'
import { resolve, resolveMany } from '../refs'
import { type Ctx, headSha } from '../repo'
import type { Sha } from '../state'
import { commitBlock, decorations } from './format'

export function log(ctx: Ctx, args: string[]) {
  const { flags, positional } = parseArgs(args, {
    flags: { '--oneline': 'oneline', '--all': 'all', '--decorate': 'decorate' },
  })
  if (positional.length > 1) fail('fatal: gittle only logs one revision at a time')

  const s = ctx.state
  const rev = positional[0] ?? 'HEAD'
  const reachable = new Set<Sha>()
  if (!flags.has('all') && rev.includes('..')) {
    for (const sha of resolveMany(s, rev, ctx.opts)) reachable.add(sha) // A..B: what B has that A doesn't
  } else {
    const starts = flags.has('all')
      ? [headSha(s), ...Object.values(s.branches), ...Object.values(s.tags)]
      : [resolve(s, rev, ctx.opts)]
    for (const start of starts) for (const sha of ancestors(s, start)) reachable.add(sha)
  }

  const commits = [...reachable].map((sha) => s.commits[sha]).sort((a, b) => b.seq - a.seq)
  commits.forEach((c, i) => {
    if (flags.has('oneline')) return ctx.info(`${c.sha}${decorations(s, c.sha)} ${c.message}`)
    if (i > 0) ctx.info('')
    commitBlock(ctx, c.sha)
  })
}
