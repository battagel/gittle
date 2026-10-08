import { fail } from '../errors'
import { isAncestor } from '../graph'
import { parseArgs } from '../parse'
import { resolve } from '../refs'
import { type Ctx, createBranch, currentBranch, headSha, moveBranch } from '../repo'
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
    },
    options: { '-u': 'upstream', '--set-upstream-to': 'upstream' },
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

  if (options.upstream !== undefined) {
    const b = positional[0] ?? currentBranch(s)
    if (!b || !s.branches[b]) fail(`fatal: branch '${b ?? 'HEAD'}' does not exist`)
    return setUpstream(ctx, b, options.upstream)
  }

  if (flags.has('list') || !positional.length) {
    if (!flags.has('remotes')) {
      if (s.head.type === 'detached') ctx.info(`* (HEAD detached at ${s.head.sha})`)
      for (const name of Object.keys(s.branches).sort()) {
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
      for (const name of Object.keys(s.remoteTracking).sort()) ctx.info(`  ${flags.has('all') ? 'remotes/' : ''}origin/${name}`)
    }
    return
  }

  if (positional.length > 2) fail('fatal: too many arguments')
  const [name, start = 'HEAD'] = positional
  createBranch(ctx, name, resolve(s, start, ctx.opts), flags.has('force'))
  trackIfRemote(ctx, name, start)
}
