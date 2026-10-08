import { fail } from '../errors'
import { isAncestor } from '../graph'
import { parseArgs } from '../parse'
import { resolve } from '../refs'
import { type Ctx, createBranch, currentBranch, headSha, moveBranch, moveHead } from '../repo'
import { aheadBehind, setUpstream, trackIfRemote } from './remote'

export function branch(ctx: Ctx, args: string[]) {
  const { flags, options, positional } = parseArgs(args, {
    flags: {
      '-d': 'delete',
      '--delete': 'delete',
      '-D': 'force-delete',
      '-f': 'force',
      '--force': 'force',
      '-l': 'list',
      '--list': 'list',
      '-v': 'verbose',
      '-vv': 'very-verbose',
      '-r': 'remotes',
      '--remotes': 'remotes',
      '-a': 'all',
      '--all': 'all',
      '-m': 'move',
      '--move': 'move',
      '-M': 'force-move',
    },
    options: {
      '-u': 'upstream',
      '--set-upstream-to': 'upstream',
      '--contains': 'contains',
      '--no-contains': 'no-contains',
      '--merged': 'merged',
      '--no-merged': 'no-merged',
    },
  })
  const s = ctx.state

  if (flags.has('delete') || flags.has('force-delete')) {
    if (!positional.length) fail('fatal: branch name required')
    for (const name of positional) {
      const tip = s.branches[name]
      if (!tip) fail(`error: branch '${name}' not found`)
      if (currentBranch(s) === name) fail(`error: cannot delete branch '${name}' checked out`)
      const up = s.upstream[name] !== undefined ? s.remoteTracking[s.upstream[name]] : undefined
      const merged = isAncestor(s, tip, headSha(s)) || (up !== undefined && isAncestor(s, tip, up))
      if (!flags.has('force-delete') && !merged) {
        fail(`error: the branch '${name}' is not fully merged`, `If you are sure you want to delete it, run 'git branch -D ${name}'`)
      }
      moveBranch(ctx, name, null)
      delete s.upstream[name]
      ctx.info(`Deleted branch ${name} (was ${tip}).`)
    }
    return
  }

  if (flags.has('move') || flags.has('force-move')) {
    // git branch -m [<old>] <new>: rename. Only your local branch: origin keeps the old name, and the branch
    // keeps tracking its old upstream until you push it under the new name.
    if (!positional.length || positional.length > 2) fail('fatal: branch name required')
    const [old, name] = positional.length === 2 ? positional : [currentBranch(s) ?? fail('fatal: cannot rename the current branch while not on any'), positional[0]]
    const tip = s.branches[old]
    if (tip === undefined) fail(`error: refname refs/heads/${old} not found`, 'fatal: Branch rename failed')
    if (old === name) return
    const log = s.reflogs[old] ?? []
    ctx.reason = `Branch: renamed refs/heads/${old} to refs/heads/${name}`
    createBranch(ctx, name, tip, flags.has('force-move'))
    moveBranch(ctx, old, null)
    s.reflogs[name] = [...log, { sha: tip, message: ctx.reason }] // the reflog moves with the branch
    if (s.upstream[old] !== undefined) s.upstream[name] = s.upstream[old]
    delete s.upstream[old]
    if (currentBranch(s) === old) moveHead(ctx, { type: 'branch', name })
    return
  }

  if (options.upstream !== undefined) {
    const b = positional[0] ?? currentBranch(s)
    if (!b || !s.branches[b]) fail(`fatal: branch '${b ?? 'HEAD'}' does not exist`)
    return setUpstream(ctx, b, options.upstream)
  }

  // filters for listing: which branches contain a commit / are merged into one
  const filters = (['contains', 'no-contains', 'merged', 'no-merged'] as const).filter((f) => options[f] !== undefined)
  const keep = (tip: string) =>
    filters.every((f) => {
      const c = resolve(s, options[f], ctx.opts)
      return f === 'contains' ? isAncestor(s, c, tip) : f === 'no-contains' ? !isAncestor(s, c, tip) : f === 'merged' ? isAncestor(s, tip, c) : !isAncestor(s, tip, c)
    })

  if (flags.has('list') || !positional.length || filters.length) {
    if (!flags.has('remotes')) {
      if (s.head.type === 'detached' && keep(s.head.sha)) ctx.info(`* (HEAD detached at ${s.head.sha})`)
      for (const name of Object.keys(s.branches).sort()) {
        if (!keep(s.branches[name])) continue
        let extra = ''
        if (flags.has('verbose') || flags.has('very-verbose')) {
          // git branch -v: "main abc1234 [ahead 1] msg";  -vv: "main abc1234 [origin/main: ahead 1] msg"
          const ab = aheadBehind(s, name)
          const counts = ab ? [ab.ahead && `ahead ${ab.ahead}`, ab.behind && `behind ${ab.behind}`].filter(Boolean).join(', ') : ''
          const track = !ab
            ? ''
            : flags.has('very-verbose')
              ? ` [origin/${ab.upstream}${counts ? `: ${counts}` : ''}]`
              : counts
                ? ` [${counts}]`
                : ''
          extra = ` ${s.branches[name]}${track} ${s.commits[s.branches[name]].message}`
        }
        ctx.info(`${currentBranch(s) === name ? '*' : ' '} ${name}${extra}`)
      }
    }
    if (flags.has('remotes') || flags.has('all')) {
      for (const name of Object.keys(s.remoteTracking).sort()) {
        if (keep(s.remoteTracking[name])) ctx.info(`  ${flags.has('all') ? 'remotes/' : ''}origin/${name}`)
      }
    }
    return
  }

  if (positional.length > 2) fail('fatal: too many arguments')
  const [name, start = 'HEAD'] = positional
  ctx.reason = s.branches[name] ? `branch: Reset to ${start}` : `branch: Created from ${start}`
  createBranch(ctx, name, resolve(s, start, ctx.opts), flags.has('force'))
  trackIfRemote(ctx, name, start)
}
