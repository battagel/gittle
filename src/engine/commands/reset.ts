import { fail } from '../errors'
import { parseArgs } from '../parse'
import { resolve } from '../refs'
import { type Ctx, setHead } from '../repo'

export function reset(ctx: Ctx, args: string[]) {
  // With no files, --soft, --mixed and --hard all do the same thing: move the branch.
  const { positional } = parseArgs(args, {
    flags: { '--soft': 'soft', '--mixed': 'mixed', '--hard': 'hard' },
  })
  if (positional.length > 1) fail('fatal: too many arguments')

  const sha = resolve(ctx.state, positional[0] ?? 'HEAD', ctx.opts)
  setHead(ctx, sha)
  ctx.info(`HEAD is now at ${sha}`)
}
