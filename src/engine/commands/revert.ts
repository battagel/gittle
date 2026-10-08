import { fail } from '../errors'
import { canApply, invert, mergeChange } from '../graph'
import { parseArgs } from '../parse'
import { resolveMany } from '../refs'
import { type Ctx, headName, headSha, newCommit, setHead } from '../repo'

export function revert(ctx: Ctx, args: string[]) {
  const { options, positional } = parseArgs(args, {
    flags: { '--no-edit': 'no-edit' },
    options: { '-m': 'mainline', '--mainline': 'mainline' },
  })
  const mainline = options.mainline === undefined ? null : Number(options.mainline)
  if (mainline !== null && !(mainline >= 1)) {
    fail(`error: option \`mainline' expects a number greater than zero`, '-m takes the parent to keep: git revert -m 1 <merge>')
  }
  if (!positional.length) fail('fatal: no commit given', 'Try: git revert <sha>')

  const s = ctx.state
  // Ranges are reverted newest first, like git.
  const shas = positional.flatMap((p) => resolveMany(s, p, ctx.opts).reverse())
  if (!shas.length) fail('error: empty commit set passed')
  for (const sha of shas) {
    const original = s.commits[sha]
    let change: string
    if (original.parents.length > 1) {
      if (mainline === null) fail(`error: commit ${sha} is a merge but no -m option was given.`, 'To undo a whole merge: git revert -m 1 <merge>')
      const parent = original.parents[mainline - 1]
      if (!parent) fail(`error: commit ${sha} does not have parent ${mainline}`)
      change = invert(mergeChange(s, sha, parent))
    } else {
      if (mainline !== null) fail(`error: mainline was specified but commit ${sha} is not a merge.`)
      change = invert(original.change)
    }
    if (!change || !canApply(s, headSha(s), change)) fail(`error: could not revert ${sha}: its change isn't here to undo.`)
    const c = newCommit(s, [headSha(s)], { change, message: `Revert "${original.message}"` })
    ctx.reason = `revert: ${c.message}`
    ctx.effect({ type: 'revert', of: sha, sha: c.sha })
    setHead(ctx, c.sha)
    ctx.info(`[${headName(s)} ${c.sha}] ${c.message}`)
  }
}
