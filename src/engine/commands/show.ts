import { parseArgs } from '../parse'
import { resolve } from '../refs'
import type { Ctx } from '../repo'
import { commitBlock } from './format'

export function show(ctx: Ctx, args: string[]) {
  const { positional } = parseArgs(args, { flags: { '-s': 'no-patch', '--no-patch': 'no-patch', '--stat': 'stat' } })
  const s = ctx.state
  const shas = (positional.length ? positional : ['HEAD']).map((p) => resolve(s, p, ctx.opts))

  shas.forEach((sha, i) => {
    if (i > 0) ctx.info('')
    commitBlock(ctx, sha)
    const c = s.commits[sha]
    const copies = Object.values(s.commits).filter((o) => o.change === c.change && o.sha !== sha && o.parents.length < 2)
    if (c.parents.length < 2 && copies.length) {
      ctx.hint(`Same change as ${copies.map((o) => `${o.label} (${o.sha})`).join(', ')}: same diff, different commit.`)
    }
  })
  ctx.hint('No diff to show: gittle has no files, only commits.')
}
