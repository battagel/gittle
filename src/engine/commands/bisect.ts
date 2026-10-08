import { fail } from '../errors'
import { ancestors } from '../graph'
import { parseArgs } from '../parse'
import { resolve } from '../refs'
import { type Ctx, headLabel, headSha, moveHead } from '../repo'
import type { Sha } from '../state'
import { isBroken } from './inspect'

// git bisect: binary-search the history between a good and a bad commit. Marking good/bad checks out the next
// commit to test (HEAD moves, so it's a stroke); `git bisect run npm test` does the whole search in one go.

export function bisect(ctx: Ctx, args: string[]) {
  const [sub, ...rest] = args
  const s = ctx.state
  switch (sub) {
    case 'start': {
      const { positional } = parseArgs(rest, {})
      s.bisect = { original: s.head, bad: null, good: [], skipped: [] }
      s.bisected = null
      if (positional[0]) s.bisect.bad = resolve(s, positional[0], ctx.opts)
      for (const g of positional.slice(1)) s.bisect.good.push(resolve(s, g, ctx.opts))
      ctx.info('status: waiting for both good and bad commits')
      return next(ctx)
    }
    case 'bad':
    case 'new':
    case 'good':
    case 'old':
    case 'skip': {
      const b = active(ctx)
      const revs = rest.length ? rest.map((r) => resolve(s, r, ctx.opts)) : [headSha(s)]
      for (const sha of revs) {
        if (sub === 'bad' || sub === 'new') b.bad = sha
        else if (sub === 'skip') b.skipped.push(sha)
        else b.good.push(sha)
      }
      return next(ctx)
    }
    case 'run': {
      const b = active(ctx)
      if (rest.join(' ') !== 'npm test') fail('gittle can only bisect run `npm test`', 'Try: git bisect run npm test')
      if (!b.bad || !b.good.length) fail('git bisect run: mark a bad and a good commit first (git bisect bad / git bisect good <commit>)')
      ctx.info('running  npm test')
      for (let guard = 0; guard < 64 && !s.bisected; guard++) {
        const here = headSha(s)
        if (isBroken(ctx, here)) b.bad = here
        else b.good.push(here)
        next(ctx)
      }
      ctx.info('bisect found first bad commit')
      return
    }
    case 'reset': {
      const b = active(ctx)
      const to = rest[0] ? { type: 'detached' as const, sha: resolve(s, rest[0], ctx.opts) } : b.original
      ctx.reason = `checkout: moving from ${headLabel(s)} to ${to.type === 'branch' ? to.name : to.sha}`
      moveHead(ctx, to)
      s.bisect = null
      ctx.info(`Previous HEAD position was ${headSha(s)}`)
      return
    }
    case 'log':
    case 'visualize':
    case 'view':
      return void ctx.info('(the graph shows it)')
    default:
      fail(`git bisect: unknown subcommand '${sub ?? ''}'`, 'start, bad, good, skip, run npm test, reset')
  }
}

function active(ctx: Ctx) {
  if (!ctx.state.bisect) fail('You need to start by "git bisect start"')
  return ctx.state.bisect
}

/** After a mark: either name the culprit, or check out the commit that best halves what's left. */
function next(ctx: Ctx) {
  const s = ctx.state
  const b = s.bisect!
  if (!b.bad || !b.good.length) {
    if (b.bad && !b.good.length) ctx.info('status: waiting for good commit(s), bad commit known')
    if (!b.bad && b.good.length) ctx.info('status: waiting for bad commit, good commit known')
    return
  }
  const good = new Set(b.good.flatMap((g) => [...ancestors(s, g)]))
  const candidates = [...ancestors(s, b.bad)].filter((c) => !good.has(c))
  const testable = candidates.filter((c) => !b.skipped.includes(c) && c !== b.bad)
  if (!testable.length) {
    if (candidates.length === 1 || candidates.every((c) => c === b.bad || b.skipped.includes(c))) {
      s.bisected = b.bad
      ctx.info(`${b.bad} is the first bad commit`)
      ctx.info(`    ${s.commits[b.bad].message}`)
      return
    }
  }
  // The commit whose ancestry splits the candidates most evenly, chosen the way git's find_bisection does: walking
  // oldest first, the first merge that sits halfway, else the first single-parent commit that does (commits with no
  // candidate parents never count as halfway), else the first with the best split.
  const n = candidates.length
  const inRange = new Set(candidates)
  const weight = (c: Sha) => [...ancestors(s, c)].filter((a) => inRange.has(a)).length
  const parentsIn = (c: Sha) => s.commits[c].parents.filter((p) => inRange.has(p)).length
  const halfway = (c: Sha) => Math.abs(2 * weight(c) - n) <= 1
  const order = [...testable].sort((x, y) => s.commits[x].seq - s.commits[y].seq)
  const split = (c: Sha) => Math.min(weight(c), n - weight(c))
  const pick =
    (b.skipped.length ? undefined : order.find((c) => parentsIn(c) > 1 && halfway(c))) ??
    (b.skipped.length ? undefined : order.find((c) => parentsIn(c) === 1 && halfway(c))) ??
    order.reduce((best, c) => (split(c) > split(best) ? c : best))
  const left = testable.length - 1
  const steps = Math.max(0, Math.ceil(Math.log2(left + 1)) - 1)
  ctx.reason = `checkout: moving from ${headLabel(s)} to ${pick}`
  moveHead(ctx, { type: 'detached', sha: pick })
  ctx.info(`Bisecting: ${left} revision${left === 1 ? '' : 's'} left to test after this (roughly ${steps} step${steps === 1 ? '' : 's'})`)
  ctx.info(`[${pick}] ${s.commits[pick].message}`)
}
