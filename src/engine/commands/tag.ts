import { fail } from '../errors'
import { parseArgs } from '../parse'
import { isValidRefName, resolve } from '../refs'
import { type Ctx, moveTag } from '../repo'

export function tag(ctx: Ctx, args: string[]) {
  const { flags, positional } = parseArgs(args, {
    flags: { '-d': 'delete', '--delete': 'delete', '-f': 'force', '--force': 'force', '-l': 'list', '--list': 'list', '-a': 'annotate' },
    options: { '-m': 'message' },
  })
  const s = ctx.state

  if (flags.has('delete')) {
    if (!positional.length) fail('fatal: tag name required')
    for (const name of positional) {
      const sha = s.tags[name]
      if (!sha) fail(`error: tag '${name}' not found.`)
      moveTag(ctx, name, null)
      ctx.info(`Deleted tag '${name}' (was ${sha})`)
    }
    return
  }

  if (flags.has('list') || !positional.length) {
    for (const name of Object.keys(s.tags).sort()) ctx.info(name)
    return
  }

  if (positional.length > 2) fail('fatal: too many arguments')
  const [name, rev = 'HEAD'] = positional
  if (!isValidRefName(name)) fail(`fatal: '${name}' is not a valid tag name.`)
  if (s.tags[name] && !flags.has('force')) fail(`fatal: tag '${name}' already exists`)
  moveTag(ctx, name, resolve(s, rev, ctx.opts))
}
