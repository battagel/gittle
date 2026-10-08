import { fail } from '../errors'
import { parseArgs } from '../parse'
import { isValidRefName, resolve } from '../refs'
import { isAncestor } from '../graph'
import { type Ctx, moveTag } from '../repo'

export function tag(ctx: Ctx, args: string[]) {
  const { flags, options, positional } = parseArgs(args, {
    flags: { '-d': 'delete', '--delete': 'delete', '-f': 'force', '--force': 'force', '-l': 'list', '--list': 'list', '-a': 'annotate' },
    options: { '-m': 'message', '--contains': 'contains', '--no-contains': 'no-contains', '--merged': 'merged' },
  })
  const s = ctx.state

  if (flags.has('delete')) {
    if (!positional.length) fail('fatal: tag name required')
    for (const name of positional) {
      const sha = s.tags[name]
      if (!sha) fail(`error: tag '${name}' not found.`)
      moveTag(ctx, name, null)
      delete s.annotated[name]
      ctx.info(`Deleted tag '${name}' (was ${sha})`)
    }
    return
  }

  const filters = (['contains', 'no-contains', 'merged'] as const).filter((f) => options[f] !== undefined)
  if (flags.has('list') || !positional.length || filters.length) {
    for (const name of Object.keys(s.tags).sort()) {
      const ok = filters.every((f) => {
        const c = resolve(s, options[f]!, ctx.opts)
        return f === 'contains' ? isAncestor(s, c, s.tags[name]) : f === 'no-contains' ? !isAncestor(s, c, s.tags[name]) : isAncestor(s, s.tags[name], c)
      })
      if (ok) ctx.info(name)
    }
    return
  }

  if (positional.length > 2) fail('fatal: too many arguments')
  const [name, rev = 'HEAD'] = positional
  if (!isValidRefName(name)) fail(`fatal: '${name}' is not a valid tag name.`)
  if (s.tags[name] && !flags.has('force')) fail(`fatal: tag '${name}' already exists`)
  moveTag(ctx, name, resolve(s, rev, ctx.opts))
  if (flags.has('annotate') || options.message !== undefined) s.annotated[name] = options.message ?? name
  else delete s.annotated[name]
}
