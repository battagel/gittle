import { fail } from '../errors'
import { canApply } from '../graph'
import { parseArgs } from '../parse'
import { resolveMany } from '../refs'
import { type Ctx, copyCommit, headName, headSha, setHead } from '../repo'

export function cherryPick(ctx: Ctx, args: string[]) {
  const { positional } = parseArgs(args, {})
  if (!positional.length) fail('fatal: no commit given', 'Try: git cherry-pick <sha>, or a range: git cherry-pick A..B')

  const s = ctx.state
  const shas = positional.flatMap((p) => resolveMany(s, p, ctx.opts))
  if (!shas.length) fail('error: empty commit set passed')
  // All or nothing: if any pick fails, run() discards the whole draft.
  for (const sha of shas) {
    const original = s.commits[sha]
    if (original.parents.length > 1) fail(`error: commit ${sha} is a merge but no -m option was given.`)
    if (!canApply(s, headSha(s), original.change)) {
      fail(`error: cherry-pick of ${sha} would be empty: that change is already here.`)
    }
    const copy = copyCommit(s, original, headSha(s))
    ctx.reason = `cherry-pick: ${copy.message}`
    ctx.effect({ type: 'copy', from: sha, to: copy.sha })
    setHead(ctx, copy.sha)
    ctx.info(`[${headName(s)} ${copy.sha}] ${copy.message}`)
  }
}
