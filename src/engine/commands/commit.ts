import { fail } from '../errors'
import { parseArgs } from '../parse'
import { type Ctx, headName, headSha, newCommit, setHead } from '../repo'

export function commit(ctx: Ctx, args: string[]) {
  // -a/--allow-empty are accepted out of habit; there are no files in gittle. The message defaults to the label.
  const { options, positional } = parseArgs(args, {
    flags: { '-a': 'all', '--all': 'all', '--allow-empty': 'allow-empty' },
    options: { '-m': 'message', '--message': 'message', '-am': 'message' },
  })
  if (positional.length) fail(`error: pathspec '${positional[0]}' did not match any file(s) known to git`, 'There are no files in gittle. Just run `git commit`.')

  const s = ctx.state
  const c = newCommit(s, [headSha(s)], { message: options.message?.trim() || undefined })
  ctx.reason = `commit: ${c.message}`
  ctx.effect({ type: 'commit', sha: c.sha })
  setHead(ctx, c.sha)
  ctx.info(`[${headName(s)} ${c.sha}] ${c.message}`)
}
