import { fail } from '../errors'
import { ancestors, isAncestor } from '../graph'
import { parseArgs } from '../parse'
import { resolve } from '../refs'
import { type Ctx, currentBranch, headSha } from '../repo'
import type { Sha } from '../state'

/** git reflog [show] [<ref>]: where a ref has pointed, newest first, as HEAD@{0}, HEAD@{1}… */
export function reflog(ctx: Ctx, args: string[]) {
  const { positional } = parseArgs(args, { flags: { '--oneline': 'oneline' } })
  const rest = positional[0] === 'show' ? positional.slice(1) : positional
  const name = rest[0] ?? 'HEAD'
  const s = ctx.state
  const log = s.reflogs[name]
  if (!log) fail(`fatal: ambiguous argument '${name}': unknown revision or path not in the working tree.`)
  ;[...log].reverse().forEach((e, i) => ctx.info(`${e.sha} ${name}@{${i}}: ${e.message}`))
}

/** git merge-base [--all] A B, or --is-ancestor A B */
export function mergeBase(ctx: Ctx, args: string[]) {
  const { flags, positional } = parseArgs(args, { flags: { '--all': 'all', '-a': 'all', '--is-ancestor': 'is-ancestor' } })
  if (positional.length !== 2) fail('usage: git merge-base [--all] <commit> <commit>  |  git merge-base --is-ancestor <commit> <commit>')
  const s = ctx.state
  const [a, b] = positional.map((p) => resolve(s, p, ctx.opts))
  if (flags.has('is-ancestor')) {
    // real git says nothing and answers with its exit code; spell it out here
    ctx.hint(isAncestor(s, a, b) ? `yes: ${positional[0]} is an ancestor of ${positional[1]} (exit 0)` : `no: ${positional[0]} is not an ancestor of ${positional[1]} (exit 1)`)
    return
  }
  const inB = ancestors(s, b)
  const common = [...ancestors(s, a)].filter((c) => inB.has(c))
  // the best common ancestors aren't ancestors of another common ancestor; newest first
  const bases = common.filter((c) => !common.some((o) => o !== c && isAncestor(s, c, o))).sort((x, y) => s.commits[y].seq - s.commits[x].seq)
  if (!bases.length) fail('(no common ancestor)')
  for (const sha of flags.has('all') ? bases : bases.slice(0, 1)) ctx.info(sha)
}

/** git describe [--tags] [<commit>]: the nearest tag, and how far past it: v1.2-3-gabc1234 */
export function describe(ctx: Ctx, args: string[]) {
  const { flags, positional } = parseArgs(args, { flags: { '--tags': 'tags', '--long': 'long' } })
  const s = ctx.state
  const target = resolve(s, positional[0] ?? 'HEAD', ctx.opts)
  const mine = ancestors(s, target)
  const usable = Object.entries(s.tags).filter(([name, sha]) => mine.has(sha) && (flags.has('tags') || s.annotated[name] !== undefined))
  if (!usable.length) {
    if (!Object.keys(s.tags).length) fail('fatal: No names found, cannot describe anything.')
    fail(
      `fatal: No annotated tags can describe '${target}'.`,
      flags.has('tags') ? '' : 'However, there were unannotated tags: try --tags.',
    )
  }
  // distance = commits in the target's history that aren't in the tag's
  const scored = usable
    .map(([name, sha]) => ({ name, sha, depth: [...mine].filter((c) => !ancestors(s, sha).has(c)).length }))
    .sort((x, y) => x.depth - y.depth || s.commits[y.sha].seq - s.commits[x.sha].seq)
  const best = scored[0]
  ctx.info(best.depth === 0 && !flags.has('long') ? best.name : `${best.name}-${best.depth}-g${target}`)
}

/** npm test: the level's test suite. Fails on any commit where the bug's change is in effect. */
export function npmTest(ctx: Ctx, args: string[]) {
  if (args[0] !== 'test') fail(`npm: only \`npm test\` is available here.`)
  const s = ctx.state
  if (!s.bug) fail('npm ERR! Missing script: "test" (this level has no tests)')
  const broken = isBroken(ctx, headSha(s))
  const where = currentBranch(s) ?? headSha(s)
  ctx.info(`> test (${where})`)
  if (broken) fail('✗ 1 failing: checkout total is wrong', 'This commit is bad: the bug is in its history.')
  ctx.info('✓ all tests passing')
}

/** Is the level's bug in effect at `sha`? */
export function isBroken(ctx: Ctx, sha: Sha): boolean {
  const s = ctx.state
  if (!s.bug) return false
  let net = 0
  for (const c of ancestors(s, sha)) {
    for (const part of s.commits[c].change.split(' ')) {
      if (part === s.bug) net++
      if (part === `-${s.bug}`) net--
    }
  }
  return net > 0
}
