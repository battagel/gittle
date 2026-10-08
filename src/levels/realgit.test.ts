import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRepo, run, runServer, type RepoState, type Sha } from '../engine'
import { tokenize } from '../engine/parse'
import { levelFiles, parseLevel } from './load'

// Real-git check (docs/testing.md): replays each level's setup + solution through the engine and through real git
// in lockstep, comparing the shape of every branch, tag and HEAD after each step. Not strict: it uses whatever git
// is installed, and ignores messages and output text. Run with `npm run levels:realgit` (add `-- -t <id>` for one).

/** A throwaway real repo where each gittle commit adds its own file, <label>.txt, so changes map 1:1. */
class RealRepo {
  readonly root = mkdtempSync(join(tmpdir(), 'gittle-'))
  readonly work = join(this.root, 'work') // the player's clone
  readonly bare = join(this.root, 'origin.git') // origin
  readonly mate = join(this.root, 'mate') // a teammate's clone, for `server:` lines
  readonly hasOrigin: boolean
  readonly shaOf = new Map<string, string>() // engine label -> real sha
  readonly protectedBranches: string[] = []
  private clock = 0

  constructor(origin = false) {
    this.hasOrigin = origin
    mkdirSync(this.work)
    this.git('init', '-q', '-b', 'main')
    this.commit('C0')
    if (origin) {
      this.in(this.root, 'init', '-q', '--bare', '-b', 'main', this.bare)
      this.git('remote', 'add', 'origin', this.bare)
      this.git('push', '-q', '-u', 'origin', 'main')
      this.in(this.root, 'clone', '-q', this.bare, this.mate)
    }
  }

  git(...args: string[]): string {
    return this.in(this.work, ...args)
  }

  in(cwd: string, ...args: string[]): string {
    // a clock that ticks per git call, so commit dates follow the engine's commit order (bisect's walk depends on it)
    const date = `${1_700_000_000 + this.clock++ * 60} +0000`
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null', // keep the user's config (hooks, gpg, pull.rebase...) out of it
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'gittle',
        GIT_AUTHOR_EMAIL: 'gittle@example.com',
        GIT_COMMITTER_NAME: 'gittle',
        GIT_COMMITTER_EMAIL: 'gittle@example.com',
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    })
  }

  commit(label: string) {
    writeFileSync(join(this.work, `${label}.txt`), `${label}\n`)
    this.git('add', '-A')
    this.git('commit', '-q', '-m', label)
    this.shaOf.set(label, this.git('rev-parse', 'HEAD').trim())
  }

  /** Swap labels (C3, C3'~1, C2..C5) for real shas. */
  translate(tokens: string[]): string[] {
    return tokens.map((t) => t.replace(/(?<![\w-])C\d+'*(?=$|[~^.])/g, (label) => this.shaOf.get(label) ?? label))
  }

  /** Branch/tag/HEAD (and origin/*, and the server's branches) → a recursive signature of their history. */
  shape(): Shape {
    const local = this.signer(this.work)
    let head: string
    try {
      head = `branch:${this.git('symbolic-ref', '-q', '--short', 'HEAD').trim()}`
    } catch {
      head = `detached:${local.sig(this.git('rev-parse', 'HEAD').trim())}`
    }
    const reflog = this.git('reflog', '--format=%H', 'HEAD').trim().split('\n').filter(Boolean).map(local.sig)
    const shape: Shape = { branches: local.refs('refs/heads'), tags: local.refs('refs/tags'), head, reflog }
    if (this.hasOrigin) {
      shape.remote = local.refs('refs/remotes/origin', (n) => n.replace(/^origin\//, ''))
      delete shape.remote['HEAD']
      shape.server = this.signer(this.bare).refs('refs/heads')
    }
    return shape
  }

  /** Signatures for one repo directory: change(parents…), with merges as M and each change read from its files. */
  private signer(dir: string) {
    const git = (...args: string[]) => this.in(dir, ...args)
    const parents = new Map<string, string[]>()
    const reflog = dir === this.work ? ['--reflog'] : [] // reflog-only (abandoned) commits too
    for (const line of git('rev-list', '--all', ...reflog, '--parents').trim().split('\n').filter(Boolean)) {
      const [sha, ...ps] = line.split(' ')
      parents.set(sha, ps)
    }
    const change = (sha: string) => {
      if (parents.get(sha)!.length > 1) return 'M'
      return git('diff-tree', '--root', '--no-commit-id', '--name-status', '-r', sha)
        .trim()
        .split('\n')
        .map((line) => {
          const m = /^([AD])\t(.+)\.txt$/.exec(line)
          return !m ? `?${line}` : m[1] === 'A' ? m[2] : `-${m[2]}`
        })
        .sort()
        .join(' ')
    }
    const memo = new Map<string, string>()
    const sig = (sha: string): string => {
      if (!memo.has(sha)) memo.set(sha, `${change(sha)}(${parents.get(sha)!.map(sig).join(',')})`)
      return memo.get(sha)!
    }
    const refs = (prefix: string, rename = (n: string) => n) =>
      Object.fromEntries(
        git('for-each-ref', '--format=%(refname:short) %(objectname) %(*objectname)', prefix)
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => l.split(' '))
          .map(([name, sha, peeled]) => [rename(name), sig(peeled || sha)]), // annotated tags peel to their commit
      )
    return { sig, refs }
  }

  /** Protect a branch on the bare origin: a pre-receive hook rejecting non-fast-forward updates and deletes. */
  protect(branch: string) {
    this.protectedBranches.push(branch)
    const hook = join(this.bare, 'hooks', 'pre-receive')
    const list = this.protectedBranches.map((b) => `refs/heads/${b}`).join(' ')
    writeFileSync(
      hook,
      `#!/bin/sh
zero=0000000000000000000000000000000000000000
while read old new ref; do
  for p in ${list}; do
    [ "$ref" = "$p" ] || continue
    [ "$new" = "$zero" ] && echo "protected branch hook declined" && exit 1
    [ "$old" != "$zero" ] && ! git merge-base --is-ancestor "$old" "$new" && echo "protected branch hook declined" && exit 1
  done
done
exit 0
`,
      { mode: 0o755 },
    )
  }

  destroy() {
    rmSync(this.root, { recursive: true, force: true })
  }
}

interface Shape {
  branches: Record<string, string>
  tags: Record<string, string>
  head: string
  reflog: string[] // HEAD's reflog, newest first
  remote?: Record<string, string> // origin/*
  server?: Record<string, string> // the server's own branches
}

function engineShape(state: RepoState): Shape {
  const memo = new Map<Sha, string>()
  const sig = (sha: Sha): string => {
    if (!memo.has(sha)) {
      const c = state.commits[sha]
      memo.set(sha, `${c.parents.length > 1 ? 'M' : c.change.split(' ').sort().join(' ')}(${c.parents.map(sig).join(',')})`)
    }
    return memo.get(sha)!
  }
  const refs = (r: Record<string, Sha>) => Object.fromEntries(Object.entries(r).map(([n, sha]) => [n, sig(sha)]))
  const shape: Shape = {
    branches: refs(state.branches),
    tags: refs(state.tags),
    head: state.head.type === 'branch' ? `branch:${state.head.name}` : `detached:${sig(state.head.sha)}`,
    reflog: [...(state.reflogs.HEAD ?? [])].reverse().map((e) => sig(e.sha)),
  }
  if (state.origin) {
    shape.remote = refs(state.remoteTracking)
    shape.server = refs(state.origin.branches)
  }
  return shape
}

/** A `server:` setup line: the engine updates origin; in real git the teammate's clone does it and pushes. */
function serverStep(real: RealRepo, state: RepoState, directive: string): RepoState {
  const r = runServer(state, directive)
  if (r.output.length) throw new Error(`engine rejected "server: ${directive}": ${r.output[0].text}`)
  const created = Object.values(r.state.commits)
    .filter((c) => !state.commits[c.sha])
    .sort((a, b) => a.seq - b.seq)
  const mate = (...args: string[]) => real.in(real.mate, ...args)
  const [verb, ...args] = tokenize(directive)
  mate('fetch', '-q', 'origin')
  switch (verb) {
    case 'commit': {
      const b = args[0]
      mate('checkout', '-q', '-B', b, `origin/${b}`)
      writeFileSync(join(real.mate, `${created[0].label}.txt`), `${created[0].label}\n`)
      mate('add', '-A')
      mate('commit', '-q', '-m', created[0].label)
      mate('push', '-q', 'origin', b)
      break
    }
    case 'merge':
      mate('checkout', '-q', '-B', args[2], `origin/${args[2]}`)
      mate('merge', '-q', '--no-ff', '--no-edit', `origin/${args[0]}`)
      mate('push', '-q', 'origin', args[2])
      break
    case 'rebase-merge':
      mate('checkout', '-q', '-B', 'pr', `origin/${args[0]}`)
      mate('rebase', '-q', `origin/${args[2]}`)
      mate('push', '-q', 'origin', `pr:${args[2]}`)
      break
    case 'rebase':
      mate('checkout', '-q', '-B', args[0], `origin/${args[0]}`)
      mate('rebase', '-q', `origin/${args[2]}`)
      mate('push', '-q', '--force', 'origin', args[0])
      break
    case 'branch':
    case 'force': {
      const label = r.state.commits[r.state.origin!.branches[args[0]]].label
      mate('push', '-q', '--force', 'origin', `${real.shaOf.get(label)}:refs/heads/${args[0]}`)
      break
    }
    case 'delete':
      mate('push', '-q', 'origin', '--delete', args[0])
      break
    case 'protect':
      real.protect(args[0])
      break
  }
  if (created.length) {
    const tips = real.in(real.mate, 'rev-list', '--first-parent', '-n', String(created.length), 'HEAD').trim().split('\n').reverse()
    created.forEach((c, i) => real.shaOf.set(c.label, tips[i]))
  }
  return r.state
}

/** Run one command in both; returns the new engine state. */
function step(real: RealRepo, state: RepoState, cmd: string): RepoState {
  if (cmd.startsWith('server:')) return serverStep(real, state, cmd.slice(7).trim())
  const r = run(state, cmd, { labels: true })
  if (cmd.startsWith('npm ')) return r.state // the level's test suite exists only in the engine
  const err = r.output.find((o) => o.kind === 'error')
  if (err) throw new Error(`engine rejected "${cmd}": ${err.text}`)

  const created = r.effects.flatMap((e) =>
    e.type === 'commit' || e.type === 'merge' || e.type === 'revert' ? [e.sha] : e.type === 'copy' ? [e.to] : [],
  )
  const [, sub, ...args] = tokenize(cmd)

  if (sub === 'commit') {
    real.commit(r.state.commits[created[0]].label)
    return r.state
  }
  const extra = sub === 'merge' || sub === 'revert' ? ['--no-edit'] : []
  // `npm test` fails when the bug's change is in effect, i.e. its file exists
  const realArgs =
    sub === 'bisect' && args[0] === 'run' ? ['run', 'sh', '-c', `test ! -f ${state.bug}.txt`] : real.translate(args)
  try {
    real.git(sub, ...extra, ...realArgs)
  } catch (e) {
    throw new Error(`real git rejected "${cmd}": ${(e as { stderr?: string }).stderr ?? e}`)
  }
  // Every command here creates its commits on HEAD's first-parent chain, oldest first.
  if (created.length) {
    const realNew = real.git('rev-list', '--first-parent', '-n', String(created.length), 'HEAD').trim().split('\n').reverse()
    created.forEach((sha, i) => real.shaOf.set(r.state.commits[sha].label, realNew[i]))
  }
  return r.state
}

describe.runIf(import.meta.env.GITTLE_REALGIT)('engine matches real git', { timeout: 60_000 }, () => {
  let real: RealRepo | null = null
  afterEach(() => real?.destroy())

  it('notices when the two diverge (sanity check)', () => {
    real = new RealRepo()
    let state = createRepo('sanity')
    state = step(real, state, 'git commit')
    expect(real.shape()).toEqual(engineShape(state))
    real.git('revert', '--no-edit', 'HEAD') // real git moves on, the engine doesn't
    expect(real.shape()).not.toEqual(engineShape(state))
  })

  it('branch navigation (switch -, checkout -, @{-1}) matches', () => {
    real = new RealRepo()
    let state = createRepo('nav')
    const cmds = [
      'git switch -c feature',
      'git commit',
      'git switch -',
      'git switch -',
      'git switch feature', // already on: still recorded
      'git switch -',
      'git checkout -b x',
      'git checkout -',
      'git checkout --detach HEAD',
      'git switch -',
      'git switch main',
      'git merge -',
      'git switch -c r1',
      'git switch main',
      'git rebase main feature', // switches without recording
      'git switch -',
      'git checkout @{-1}',
    ]
    for (const cmd of cmds) {
      state = step(real, state, cmd)
      expect(real.shape(), `after "${cmd}"`).toEqual(engineShape(state))
    }
  })

  it('revert -m, revert the revert, rebase --onto and ranges match', () => {
    real = new RealRepo()
    let state = createRepo('pro')
    const cmds = [
      'git switch -c feature',
      'git commit',
      'git commit',
      'git switch main',
      'git commit',
      'git merge feature',
      'git revert -m 1 HEAD',
      'git merge feature', // already up to date
      'git revert HEAD', // revert the revert
      'git switch -c drop main',
      'git commit',
      'git commit',
      'git commit',
      'git rebase --onto C7 C8 drop', // drop a middle commit
      'git switch -c exp C4',
      'git commit',
      'git switch -c onexp',
      'git commit',
      'git rebase --onto main exp onexp', // move off the wrong base
      'git switch main',
      'git cherry-pick C7..C9',
      'git revert HEAD~2..HEAD',
    ]
    for (const cmd of cmds) {
      state = step(real, state, cmd)
      expect(real.shape(), `after "${cmd}"`).toEqual(engineShape(state))
    }
  })

  it('remotes (fetch, pull, push, leases, teammates) match', () => {
    real = new RealRepo(true)
    let state = createRepo('remote', { origin: true })
    const cmds = [
      'git commit', // C1
      'git push',
      'server: commit main -m "Nikita fix"', // C2, only on origin
      'git commit', // C3: now diverged
      'git fetch',
      'git pull --rebase', // C3'
      'git push',
      'git switch -c feature',
      'git commit', // C4
      'git push -u origin feature',
      'server: merge feature into main', // C5: a pull request
      'git switch main',
      'git pull', // fast-forward
      'git switch -c f2',
      'git commit', // C6
      'git push -u origin f2',
      'server: commit f2', // C7: a teammate pushed to f2
      'git commit', // C8
      'git fetch',
      'git push --force-with-lease', // allowed now we've seen C7
      'server: branch review C1',
      'git fetch',
      'git switch review', // creates a branch tracking origin/review
      'git push origin --delete review',
      'git switch main',
      'server: commit main', // C9
      'git commit', // C10
      'git pull --no-rebase', // C11: merge
      'git push',
      'server: rebase-merge f2 into main', // C6', C8'
      'git pull',
      'git switch f2',
      'git branch -m renamed', // origin keeps f2
      'git push -u origin HEAD',
      'git push origin --delete f2',
    ]
    for (const cmd of cmds) {
      state = step(real, state, cmd)
      expect(real.shape(), `after "${cmd}"`).toEqual(engineShape(state))
    }
  }, 60_000)

  it('reflog refs, annotated tags and bisect match', () => {
    real = new RealRepo()
    let state: RepoState = { ...createRepo('inspect'), bug: 'C6' }
    const go = (cmd: string) => {
      state = step(real!, state, cmd)
      expect(real!.shape(), `after "${cmd}"`).toEqual(engineShape(state))
    }
    for (let i = 0; i < 10; i++) go('git commit') // C1..C10; C6 breaks the tests
    go('git tag -a v1.0 -m "Release 1.0" C3')
    go('git reset --hard HEAD~3')
    go('git commit') // C11
    go('git reset --hard HEAD@{2}') // back to where main was before the reset
    go('git switch -c side C2')
    go('git switch main')
    go('git checkout main@{1}')
    go('git switch main')
    // a manual bisect, marking as npm test says
    go('git bisect start')
    go('git bisect bad')
    go('git bisect good C0')
    for (let i = 0; i < 8 && !state.bisected; i++) {
      const broken = run(state, 'npm test').output.some((o) => o.kind === 'error')
      go(broken ? 'git bisect bad' : 'git bisect good')
    }
    expect(state.commits[state.bisected!].label).toBe('C6')
    go('git bisect reset')
    go('git bisect start HEAD C0')
    go('git bisect run npm test')
    expect(state.commits[state.bisected!].label).toBe('C6')
    go('git bisect reset')
  })

  it.each(['C4', 'C7', 'C9', 'C12'])('bisect through merges matches (bug %s)', (bug) => {
    real = new RealRepo()
    let state: RepoState = { ...createRepo('bisect-merges'), bug }
    const go = (cmd: string) => {
      state = step(real!, state, cmd)
      expect(real!.shape(), `after "${cmd}"`).toEqual(engineShape(state))
    }
    for (const cmd of [
      'git commit', 'git commit', 'git switch -c a', 'git commit', 'git commit', 'git switch main', 'git commit',
      'git switch -c b', 'git commit', 'git commit', 'git switch main', 'git merge a', 'git commit', 'git merge b',
      'git commit', 'git commit',
    ]) go(cmd)
    // no `bisect skip` here: after a skip git picks pseudo-randomly near the midpoint
    go('git bisect start HEAD C0')
    for (let i = 0; i < 12 && !state.bisected; i++) {
      const broken = run(state, 'npm test').output.some((o) => o.kind === 'error')
      go(broken ? 'git bisect bad' : 'git bisect good')
    }
    go('git bisect reset')
    go('git bisect start HEAD C0')
    go('git bisect run npm test')
    expect(state.commits[state.bisected!].label).toBe(bug)
    go('git bisect reset')
  })

  it('protected branches reject force-pushes in both', () => {
    real = new RealRepo(true)
    let state = createRepo('protect', { origin: true })
    for (const cmd of ['git commit', 'git push', 'server: protect main', 'git reset --hard HEAD~1', 'git commit']) {
      state = step(real, state, cmd)
    }
    expect(run(state, 'git push --force').output[0].kind).toBe('error')
    expect(() => real!.git('push', '--force', 'origin', 'main')).toThrow()
    expect(real.shape()).toEqual(engineShape(state))
  })

  it.each(Object.entries(levelFiles))('%s', (path, source) => {
    const level = parseLevel(path, source)
    real = new RealRepo(level.start.origin !== null)
    let state: RepoState = { ...createRepo(level.id, { origin: level.start.origin !== null }), bug: level.bug }
    for (const cmd of [...level.setup, ...level.solution]) {
      state = step(real, state, cmd)
      expect(real.shape(), `after "${cmd}"`).toEqual(engineShape(state))
    }
  })
})
