import { currentBranch } from '../repo'
import { fullSha } from '../sha'
import type { Ctx } from '../repo'
import type { RepoState, Sha } from '../state'

/** " (HEAD -> main, feature, tag: v1)" like git's decorations. */
export function decorations(s: RepoState, sha: Sha): string {
  const parts: string[] = []
  const current = currentBranch(s)
  if (s.head.type === 'detached' && s.head.sha === sha) parts.push('HEAD')
  if (current && s.branches[current] === sha) parts.push(`HEAD -> ${current}`)
  for (const name of Object.keys(s.branches).sort()) {
    if (name !== current && s.branches[name] === sha) parts.push(name)
  }
  for (const name of Object.keys(s.tags).sort()) {
    if (s.tags[name] === sha) parts.push(`tag: ${name}`)
  }
  return parts.length ? ` (${parts.join(', ')})` : ''
}

/** The `commit <full sha>` block shared by `git log` and `git show`. */
export function commitBlock(ctx: Ctx, sha: Sha) {
  const s = ctx.state
  const c = s.commits[sha]
  ctx.info(`commit ${fullSha(s, sha)}${decorations(s, sha)}`)
  if (c.parents.length > 1) ctx.info(`Merge: ${c.parents.join(' ')}`)
  ctx.info('')
  ctx.info(`    ${c.message}`)
}
