import { fail } from '../errors'
import { ancestors, isAncestor } from '../graph'
import { parseArgs } from '../parse'
import { isValidRefName } from '../refs'
import { type Ctx, currentBranch, headSha, moveRemote } from '../repo'
import type { Origin, RepoState, Sha } from '../state'
import { mergeInto } from './merge'
import { replayOnto } from './rebase'

// The one remote, `origin`. Server branches live in state.origin; your view of them in state.remoteTracking.

function needOrigin(s: RepoState): Origin {
  if (!s.origin) fail("fatal: 'origin' does not appear to be a git repository", 'This level has no remote.')
  return s.origin
}

function checkRemote(name: string | undefined) {
  if (name !== undefined && name !== 'origin') fail(`fatal: '${name}' does not appear to be a git repository`)
}

/** Copy the server's branches into origin/*; their commits become yours. Returns what changed, for output. */
export function fetchAll(ctx: Ctx, prune = false) {
  const s = ctx.state
  const origin = needOrigin(s)
  const lines: string[] = []
  for (const [b, sha] of Object.entries(origin.branches)) {
    const before = s.remoteTracking[b]
    if (before === sha) continue
    for (const c of ancestors(s, sha)) s.commits[c].local = true
    moveRemote(ctx, b, sha)
    if (!before) lines.push(` * [new branch]      ${b} -> origin/${b}`)
    else if (isAncestor(s, before, sha)) lines.push(`   ${before}..${sha}  ${b} -> origin/${b}`)
    else lines.push(` + ${before}...${sha} ${b} -> origin/${b}  (forced update)`)
  }
  for (const [t, sha] of Object.entries(origin.tags)) {
    if (s.tags[t]) continue
    for (const c of ancestors(s, sha)) s.commits[c].local = true
    s.tags[t] = sha
    lines.push(` * [new tag]         ${t} -> ${t}`)
  }
  if (prune) {
    for (const b of Object.keys(s.remoteTracking)) {
      if (origin.branches[b] === undefined) {
        moveRemote(ctx, b, null)
        lines.push(` - [deleted]         (none) -> origin/${b}`)
      }
    }
  }
  if (lines.length) {
    ctx.info('From origin')
    lines.forEach((l) => ctx.info(l))
  }
}

export function fetch(ctx: Ctx, args: string[]) {
  const { flags, positional } = parseArgs(args, { flags: { '--prune': 'prune', '-p': 'prune', '--all': 'all' } })
  checkRemote(positional[0])
  fetchAll(ctx, flags.has('prune'))
}

export function pull(ctx: Ctx, args: string[]) {
  const { flags, positional } = parseArgs(args, {
    flags: { '--rebase': 'rebase', '-r': 'rebase', '--no-rebase': 'merge', '--ff-only': 'ff-only', '--ff': 'ff', '--no-ff': 'no-ff' },
  })
  const s = ctx.state
  needOrigin(s)
  checkRemote(positional[0])
  const branch = currentBranch(s)
  if (!branch) fail('fatal: You are not currently on a branch.', 'Switch to a branch first.')
  const upstream = positional[1] ?? s.upstream[branch]
  if (!upstream) {
    fail('There is no tracking information for the current branch.', `To set it: git push -u origin ${branch}  (or: git branch -u origin/<branch>)`)
  }

  fetchAll(ctx)
  const target = s.remoteTracking[upstream]
  if (!target) fail(`fatal: couldn't find remote ref ${upstream}`)
  const head = headSha(s)
  const diverged = !isAncestor(s, target, head) && !isAncestor(s, head, target)

  if (flags.has('rebase')) return replayOnto(ctx, target, null, { reflog: 'pull --rebase', ontoName: target })
  if (diverged && !flags.has('merge') && !flags.has('ff') && !flags.has('no-ff')) {
    if (flags.has('ff-only')) fail('fatal: Not possible to fast-forward, aborting.')
    fail('fatal: Need to specify how to reconcile divergent branches.', 'git pull --rebase  (replay your commits on top), or  git pull --no-rebase  (merge)')
  }
  mergeInto(ctx, target, {
    noFF: flags.has('no-ff'),
    ffOnly: flags.has('ff-only'),
    message: `Merge branch '${upstream}' of origin`,
    reflog: 'pull',
  })
}

export function push(ctx: Ctx, args: string[]) {
  const { flags, positional } = parseArgs(args, {
    flags: {
      '-u': 'set-upstream',
      '--set-upstream': 'set-upstream',
      '-f': 'force',
      '--force': 'force',
      '--force-with-lease': 'lease',
      '-d': 'delete',
      '--delete': 'delete',
      '--tags': 'tags',
    },
  })
  const s = ctx.state
  const origin = needOrigin(s)
  checkRemote(positional[0])
  const names = positional.slice(1)

  if (flags.has('delete')) {
    if (!names.length) fail('fatal: --delete doesn\'t make sense without any refs')
    for (const b of names) {
      if (origin.branches[b] === undefined) fail(`error: unable to delete '${b}': remote ref does not exist`)
      if (origin.protected.includes(b)) fail(` ! [remote rejected] ${b} (protected branch hook declined)`, `'${b}' is protected on origin: it can't be deleted.`)
      delete origin.branches[b]
      moveRemote(ctx, b, null)
      ctx.info(` - [deleted]         ${b}`)
    }
    return
  }

  if (flags.has('tags')) {
    for (const [t, sha] of Object.entries(s.tags)) if (origin.tags[t] === undefined) pushTag(ctx, origin, t, sha)
    return
  }

  // which local branch goes to which server branch
  let pairs: [string, string][]
  if (names.length) {
    pairs = names.map((n) => {
      const [given, dst] = n.split(':')
      const src = given === 'HEAD' ? (currentBranch(s) ?? fail('fatal: You are not currently on a branch.')) : given
      return [src, dst ?? src]
    })
  } else {
    const b = currentBranch(s)
    if (!b) fail('fatal: You are not currently on a branch.')
    const up = s.upstream[b]
    if (!up) fail(`fatal: The current branch ${b} has no upstream branch.`, `To push it and set the upstream: git push -u origin ${b}`)
    if (up !== b) {
      // git's default ("simple") push refuses when the names differ, e.g. after `git branch -m`
      fail(
        'fatal: The upstream branch of your current branch does not match the name of your current branch.',
        `To push to the upstream branch: git push origin HEAD:${up}   To push to a branch of the same name: git push -u origin ${b}`,
      )
    }
    pairs = [[b, up]]
  }

  for (const [src, dst] of pairs) {
    if (s.tags[src] !== undefined && s.branches[src] === undefined) {
      pushTag(ctx, origin, dst, s.tags[src])
      continue
    }
    const sha = s.branches[src] ?? null
    if (sha === null) fail(`error: src refspec ${src} does not match any`)
    if (!isValidRefName(dst)) fail(`fatal: invalid branch name '${dst}'`)
    const theirs = origin.branches[dst]

    if (theirs === sha) {
      ctx.info('Everything up-to-date')
    } else if (theirs === undefined || isAncestor(s, theirs, sha)) {
      ctx.info(theirs === undefined ? ` * [new branch]      ${src} -> ${dst}` : `   ${theirs}..${sha}  ${src} -> ${dst}`)
    } else if (origin.protected.includes(dst)) {
      fail(
        ` ! [remote rejected] ${src} -> ${dst} (protected branch hook declined)`,
        `'${dst}' is protected on origin: history there can only move forward. No force-pushes; fix it with new commits (git revert) instead.`,
      )
    } else if (flags.has('lease') && s.remoteTracking[dst] !== theirs) {
      fail(` ! [rejected]        ${src} -> ${dst} (stale info)`, `origin/${dst} is out of date: someone pushed since you last fetched. Fetch and look before overwriting.`)
    } else if (flags.has('force') || flags.has('lease')) {
      ctx.info(` + ${theirs}...${sha} ${src} -> ${dst} (forced update)`)
    } else {
      const known = s.commits[theirs].local
      fail(
        ` ! [rejected]        ${src} -> ${dst} (${known ? 'non-fast-forward' : 'fetch first'})`,
        known
          ? 'origin has commits your branch doesn\'t. If you rewrote this branch on purpose (rebase, reset), overwrite it safely with git push --force-with-lease; otherwise bring the remote work in first (git pull --rebase, or merge).'
          : 'The remote has work you don\'t have yet: git fetch (or git pull) first.',
      )
    }
    origin.branches[dst] = sha
    moveRemote(ctx, dst, sha)
    if (flags.has('set-upstream')) {
      s.upstream[src] = dst
      ctx.info(`branch '${src}' set up to track 'origin/${dst}'.`)
    }
  }
}

function pushTag(ctx: Ctx, origin: Origin, name: string, sha: Sha) {
  if (origin.tags[name] !== undefined && origin.tags[name] !== sha) fail(` ! [rejected]        ${name} -> ${name} (already exists)`)
  if (origin.tags[name] === sha) return ctx.info('Everything up-to-date')
  origin.tags[name] = sha
  ctx.info(` * [new tag]         ${name} -> ${name}`)
}

export function remote(ctx: Ctx, args: string[]) {
  const { flags } = parseArgs(args, { flags: { '-v': 'verbose', '--verbose': 'verbose' } })
  if (!ctx.state.origin) return
  if (flags.has('verbose')) {
    ctx.info('origin\tgit@github.com:team/app.git (fetch)')
    ctx.info('origin\tgit@github.com:team/app.git (push)')
  } else ctx.info('origin')
}

/** "ahead 2, behind 1" of a branch against its upstream, or null if it has none. */
export function aheadBehind(s: RepoState, branch: string): { upstream: string; ahead: number; behind: number } | null {
  const up = s.upstream[branch]
  const theirs = up !== undefined ? s.remoteTracking[up] : undefined
  if (up === undefined || theirs === undefined) return null
  const ours = ancestors(s, s.branches[branch])
  const remote = ancestors(s, theirs)
  return {
    upstream: up,
    ahead: [...ours].filter((c) => !remote.has(c)).length,
    behind: [...remote].filter((c) => !ours.has(c)).length,
  }
}

/** Branches created from origin/<b> track it, like git's default. */
export function trackIfRemote(ctx: Ctx, branch: string, start: string) {
  if (start.startsWith('origin/') && ctx.state.remoteTracking[start.slice(7)] !== undefined) {
    setUpstream(ctx, branch, start)
  }
}

/** Point a branch's upstream at origin/<name> (`git branch -u`). */
export function setUpstream(ctx: Ctx, branch: string, ref: string) {
  const s = ctx.state
  const name = ref.replace(/^origin\//, '')
  if (!ref.startsWith('origin/') || s.remoteTracking[name] === undefined) fail(`fatal: the requested upstream branch '${ref}' does not exist`)
  s.upstream[branch] = name
  ctx.info(`branch '${branch}' set up to track 'origin/${name}'.`)
}

