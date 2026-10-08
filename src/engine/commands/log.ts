import { fail } from '../errors'
import { ancestors } from '../graph'
import { parseArgs } from '../parse'
import { resolve, resolveMany } from '../refs'
import { type Ctx, headSha } from '../repo'
import type { Sha } from '../state'
import { commitBlock, decorations } from './format'

export function log(ctx: Ctx, args: string[]) {
  // -<n> is shorthand for -n <n>
  args = args.flatMap((a) => (/^-\d+$/.test(a) ? ['-n', a.slice(1)] : [a]))
  const { flags, options, positional } = parseArgs(args, {
    flags: {
      '--oneline': 'oneline',
      '--all': 'all',
      '--decorate': 'decorate',
      '--first-parent': 'first-parent',
      '--left-right': 'left-right',
      '--merges': 'merges',
      '--no-merges': 'no-merges',
      '-i': 'ignore-case',
      '--regexp-ignore-case': 'ignore-case',
    },
    options: { '-n': 'max', '--max-count': 'max', '--grep': 'grep' },
  })
  if (positional.length > 1) fail('fatal: gittle only logs one revision (or range) at a time')

  const s = ctx.state
  const rev = positional[0] ?? 'HEAD'
  const reachable = new Set<Sha>()
  const side = new Map<Sha, '<' | '>'>() // for A...B --left-right
  const sym = /^(.*?)\.\.\.(.*)$/.exec(rev)
  if (!flags.has('all') && sym) {
    // A...B: commits in either but not both
    const [a, b] = [resolve(s, sym[1] || 'HEAD', ctx.opts), resolve(s, sym[2] || 'HEAD', ctx.opts)]
    const [inA, inB] = [ancestors(s, a), ancestors(s, b)]
    for (const c of inA) if (!inB.has(c)) (reachable.add(c), side.set(c, '<'))
    for (const c of inB) if (!inA.has(c)) (reachable.add(c), side.set(c, '>'))
  } else if (!flags.has('all') && rev.includes('..')) {
    for (const sha of resolveMany(s, rev, ctx.opts)) reachable.add(sha) // A..B: what B has that A doesn't
  } else {
    const starts = flags.has('all')
      ? [headSha(s), ...Object.values(s.branches), ...Object.values(s.tags)]
      : [resolve(s, rev, ctx.opts)]
    for (const start of starts) for (const sha of ancestors(s, start)) reachable.add(sha)
  }

  if (flags.has('first-parent')) {
    // only the commits on the starting point's own line
    const start = sym || rev.includes('..') || flags.has('all') ? null : resolve(s, rev, ctx.opts)
    if (start) {
      const line = new Set<Sha>()
      for (let c: Sha | undefined = start; c; c = s.commits[c].parents[0]) line.add(c)
      for (const c of [...reachable]) if (!line.has(c)) reachable.delete(c)
    }
  }
  let commits = [...reachable].map((sha) => s.commits[sha]).sort((a, b) => b.seq - a.seq)
  if (flags.has('merges')) commits = commits.filter((c) => c.parents.length > 1)
  if (flags.has('no-merges')) commits = commits.filter((c) => c.parents.length < 2)
  if (options.grep !== undefined) {
    const needle = flags.has('ignore-case') ? options.grep.toLowerCase() : options.grep
    commits = commits.filter((c) => (flags.has('ignore-case') ? c.message.toLowerCase() : c.message).includes(needle))
  }
  if (options.max !== undefined) commits = commits.slice(0, Number(options.max))
  commits.forEach((c, i) => {
    const mark = flags.has('left-right') && side.has(c.sha) ? `${side.get(c.sha)} ` : ''
    if (flags.has('oneline')) return ctx.info(`${mark}${c.sha}${decorations(s, c.sha)} ${c.message}`)
    if (i > 0) ctx.info('')
    commitBlock(ctx, c.sha)
  })
}
