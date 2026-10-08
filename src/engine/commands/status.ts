import { parseArgs } from '../parse'
import type { Ctx } from '../repo'
import { aheadBehind } from './remote'

export function status(ctx: Ctx, args: string[]) {
  parseArgs(args, { flags: { '-s': 'short', '--short': 'short' } })
  const s = ctx.state
  const { head } = s
  ctx.info(head.type === 'branch' ? `On branch ${head.name}` : `HEAD detached at ${head.sha}`)
  const ab = head.type === 'branch' ? aheadBehind(s, head.name) : null
  if (ab) {
    const up = `'origin/${ab.upstream}'`
    const n = (k: number) => `${k} commit${k === 1 ? '' : 's'}`
    if (ab.ahead && ab.behind) {
      ctx.info(`Your branch and ${up} have diverged,`)
      ctx.info(`and have ${ab.ahead} and ${ab.behind} different commits each, respectively.`)
    } else if (ab.ahead) ctx.info(`Your branch is ahead of ${up} by ${n(ab.ahead)}.`)
    else if (ab.behind) ctx.info(`Your branch is behind ${up} by ${n(ab.behind)}, and can be fast-forwarded.`)
    else ctx.info(`Your branch is up to date with ${up}.`)
  }
  ctx.info('nothing to commit, working tree clean')
}
