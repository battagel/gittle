import { describe, expect, it } from 'vitest'
import { createRepo, firstParentLabels, headSha, run, runServer, type RepoState } from '.'
import { tokenize } from './parse'
import { resolve } from './refs'
import { fullSha } from './sha'

/** Run commands (labels allowed, like level files), failing the test on any error. */
function play(...cmds: string[]): RepoState {
  let s = createRepo('test')
  for (const cmd of cmds) s = step(s, cmd)
  return s
}

function step(s: RepoState, cmd: string): RepoState {
  const r = run(s, cmd, { labels: true })
  const err = r.output.find((o) => o.kind === 'error')
  if (err) throw new Error(`${cmd} -> ${err.text}`)
  return r.state
}

/** First output line of a command expected to fail. */
function errorOf(s: RepoState, cmd: string): string {
  const r = run(s, cmd, { labels: true })
  expect(r.changed).toBe(false)
  expect(r.state).toBe(s)
  return r.output.find((o) => o.kind === 'error')?.text ?? '(no error)'
}

const hist = (s: RepoState, rev = 'HEAD') => firstParentLabels(s, resolve(s, rev, { labels: true }))
const label = (s: RepoState, rev: string) => s.commits[resolve(s, rev, { labels: true })].label

describe('repo basics', () => {
  it('starts with C0 on main', () => {
    const s = createRepo()
    expect(hist(s)).toEqual(['C0'])
    expect(s.head).toEqual({ type: 'branch', name: 'main' })
  })

  it('makes deterministic 7-hex shas per seed', () => {
    const a = play('git commit', 'git commit')
    const b = play('git commit', 'git commit')
    expect(Object.keys(a.commits)).toEqual(Object.keys(b.commits))
    expect(headSha(a)).toMatch(/^[0-9a-f]{7}$/)
    const other = run(createRepo('other'), 'git commit').state
    expect(headSha(other)).not.toBe(headSha(a))
  })

  it('never mutates the input state', () => {
    const s = play('git commit')
    const snapshot = structuredClone(s)
    run(s, 'git rebase C0')
    run(s, 'git commit')
    run(s, 'git switch -c x')
    expect(s).toEqual(snapshot)
  })
})

describe('stroke rule', () => {
  const s = play('git commit', 'git branch feature')

  it.each(['git log', 'git log --oneline --all', 'git status', 'help', 'git help rebase', 'git branch', 'git tag', 'git commit -h'])(
    '%s is free',
    (cmd) => expect(run(s, cmd).changed).toBe(false),
  )

  it('errors and no-ops are free', () => {
    expect(run(s, 'git merge nope').changed).toBe(false)
    expect(run(s, 'git merge feature').changed).toBe(false) // Already up to date
    expect(run(s, 'git switch main').changed).toBe(false) // Already on 'main'
  })

  it('switching branches is a stroke', () => {
    expect(run(s, 'git switch feature').changed).toBe(true)
  })
})

describe('commit', () => {
  it('advances the current branch', () => {
    const s = play('git commit', 'git commit -m "anything"')
    expect(hist(s, 'main')).toEqual(['C0', 'C1', 'C2'])
  })

  it('moves only HEAD when detached', () => {
    const s = play('git commit', 'git checkout C0', 'git commit')
    expect(hist(s, 'main')).toEqual(['C0', 'C1'])
    expect(hist(s)).toEqual(['C0', 'C2'])
  })

  it('rejects paths', () => {
    expect(errorOf(createRepo(), 'git commit file.txt')).toMatch(/pathspec/)
  })
})

describe('branch', () => {
  it('creates, refuses duplicates and bad names', () => {
    const s = play('git commit', 'git branch feature C0')
    expect(hist(s, 'feature')).toEqual(['C0'])
    expect(errorOf(s, 'git branch feature')).toMatch(/already exists/)
    expect(errorOf(s, 'git branch bad..name')).toMatch(/not a valid branch name/)
  })

  it('deletes merged branches, refuses unmerged unless -D', () => {
    const s = play('git switch -c feature', 'git commit', 'git switch main')
    expect(errorOf(s, 'git branch -d feature')).toMatch(/not fully merged/)
    expect(step(s, 'git branch -D feature').branches.feature).toBeUndefined()
    expect(errorOf(s, 'git branch -d main')).toMatch(/checked out/)
  })

  it('force-moves a branch with -f', () => {
    const s = play('git commit', 'git branch old C0', 'git branch -f old main')
    expect(label(s, 'old')).toBe('C1')
  })
})

describe('switch / checkout', () => {
  it('switch -c creates and attaches', () => {
    const s = play('git switch -c feature')
    expect(s.head).toEqual({ type: 'branch', name: 'feature' })
  })

  it('switch refuses a commit without --detach', () => {
    const s = play('git commit')
    const sha = resolve(s, 'C0', { labels: true })
    expect(errorOf(s, `git switch ${sha}`)).toMatch(/a branch is expected/)
    expect(step(s, `git switch --detach ${sha}`).head).toEqual({ type: 'detached', sha })
  })

  it('checkout of a sha detaches, checkout -b creates', () => {
    const s = play('git commit', 'git checkout HEAD~1')
    expect(s.head.type).toBe('detached')
    expect(step(s, 'git checkout -b rescue').head).toEqual({ type: 'branch', name: 'rescue' })
  })

  it('players cannot use labels', () => {
    const s = play('git commit')
    expect(run(s, 'git checkout C0').output[0].kind).toBe('error')
  })
})

describe('switch - / checkout - / @{-1}', () => {
  it('jumps back and forth between the last two branches', () => {
    const s = play('git switch -c feature', 'git switch -')
    expect(s.head).toEqual({ type: 'branch', name: 'main' })
    expect(step(s, 'git switch -').head).toEqual({ type: 'branch', name: 'feature' })
    expect(step(s, 'git checkout -').head).toEqual({ type: 'branch', name: 'feature' })
  })

  it('remembers "Already on" as a move to the same branch, like git', () => {
    const s = play('git switch -c feature', 'git switch feature')
    expect(run(s, 'git switch -').changed).toBe(false) // stays on feature
  })

  it('errors with no previous branch, or a deleted one', () => {
    expect(errorOf(createRepo(), 'git switch -')).toBe('fatal: invalid reference: @{-1}')
    const s = play('git switch -c gone', 'git switch main', 'git branch -D gone')
    expect(errorOf(s, 'git checkout -')).toBe('fatal: invalid reference: @{-1}')
  })

  it('switch - refuses a detached previous position; checkout - detaches', () => {
    const s = play('git commit', 'git checkout HEAD~1', 'git switch main')
    expect(errorOf(s, 'git switch -')).toMatch(/a branch is expected/)
    expect(step(s, 'git checkout -').head.type).toBe('detached')
  })

  it('works as a ref in merge, and as @{-1}', () => {
    const s = play('git switch -c feature', 'git commit', 'git switch main', 'git merge -')
    expect(hist(s, 'main')).toEqual(['C0', 'C1'])
    expect(label(play('git commit', 'git switch -c f', 'git commit', 'git switch main'), '@{-1}')).toBe('C2')
  })

  it('is not updated by rebase switching branches', () => {
    const s = play('git branch r1', 'git switch -c feature', 'git switch main', 'git rebase main feature', 'git switch -')
    expect(s.head).toEqual({ type: 'branch', name: 'feature' }) // previous is still where `switch main` came from
  })
})

describe('merge', () => {
  it('fast-forwards when possible', () => {
    const s = play('git switch -c feature', 'git commit', 'git switch main', 'git merge feature')
    expect(hist(s, 'main')).toEqual(['C0', 'C1'])
    expect(Object.keys(s.commits)).toHaveLength(2)
  })

  it('makes a merge commit when histories diverged', () => {
    const s = play('git switch -c feature', 'git commit', 'git switch main', 'git commit', 'git merge feature')
    const m = s.commits[headSha(s)]
    expect(m.parents.map((p) => s.commits[p].label)).toEqual(['C2', 'C1'])
  })

  it('--no-ff always makes a merge commit', () => {
    const s = play('git switch -c feature', 'git commit', 'git switch main', 'git merge --no-ff feature')
    expect(s.commits[headSha(s)].parents).toHaveLength(2)
  })
})

describe('rebase', () => {
  const diverged = ['git commit', 'git switch -c feature', 'git commit', 'git commit', 'git switch main', 'git commit']

  it('copies our commits onto upstream with new shas and primed labels', () => {
    const before = play(...diverged, 'git switch feature')
    const after = step(before, 'git rebase main')
    expect(hist(after, 'feature')).toEqual(['C0', 'C1', 'C4', "C2'", "C3'"])
    expect(headSha(after)).not.toBe(headSha(before))
    // the originals are still there, just unreachable
    expect(after.commits[headSha(before)].label).toBe('C3')
  })

  it('`git rebase <upstream> <branch>` switches first', () => {
    const s = play(...diverged, 'git rebase main feature')
    expect(s.head).toEqual({ type: 'branch', name: 'feature' })
    expect(hist(s)).toEqual(['C0', 'C1', 'C4', "C2'", "C3'"])
  })

  it('skips changes already upstream', () => {
    // main gets C2' by cherry-pick, so rebasing feature drops its C2 and only copies C3
    const s = play(...diverged, 'git cherry-pick C2')
    const r = run(s, 'git rebase main feature', { labels: true })
    expect(r.output.some((o) => o.text.startsWith('dropping'))).toBe(true)
    expect(hist(r.state)).toEqual(['C0', 'C1', 'C4', "C2'", "C3'"])
  })

  it('is a no-op when already up to date, and fast-forwards when behind', () => {
    const s = play('git switch -c feature', 'git commit')
    expect(run(s, 'git rebase main').changed).toBe(false)
    const behind = play('git branch feature', 'git commit', 'git switch feature', 'git rebase main')
    expect(hist(behind, 'feature')).toEqual(['C0', 'C1'])
  })

  it('drops merge commits', () => {
    const s = play(
      'git branch side',
      'git switch -c feature',
      'git commit',
      'git switch side',
      'git commit',
      'git switch feature',
      'git merge side',
      'git switch main',
      'git commit',
      'git rebase main feature',
    )
    expect(hist(s)).toEqual(['C0', 'C4', "C1'", "C2'"])
  })
})

describe('cherry-pick', () => {
  it('copies a change onto HEAD', () => {
    const s = play('git switch -c feature', 'git commit', 'git commit', 'git switch main', 'git cherry-pick C2')
    expect(hist(s)).toEqual(['C0', "C2'"])
    expect(s.commits[headSha(s)].change).toBe('C2')
  })

  it('refuses a change that is already applied', () => {
    const s = play('git commit', 'git branch other', 'git commit')
    expect(errorOf(s, 'git cherry-pick C1')).toMatch(/already here/)
  })

  it('can re-apply a change after it was reverted', () => {
    const s = play('git commit', 'git revert C1', 'git cherry-pick C1')
    expect(hist(s)).toEqual(['C0', 'C1', 'C2', "C1'"])
  })

  it('is all or nothing', () => {
    const s = play('git switch -c feature', 'git commit', 'git switch main')
    expect(errorOf(s, 'git cherry-pick C1 nope')).toMatch(/bad revision/)
  })
})

describe('reset', () => {
  it('moves the branch; all modes behave the same; commits stay reachable by sha', () => {
    const s = play('git commit', 'git commit')
    const lost = headSha(s)
    for (const mode of ['--soft', '--mixed', '--hard', '']) {
      const r = step(s, `git reset ${mode} HEAD~2`)
      expect(hist(r)).toEqual(['C0'])
      expect(step(r, `git checkout ${lost}`).head).toEqual({ type: 'detached', sha: lost })
    }
  })
})

describe('revert', () => {
  it('adds an inverse commit, and cannot undo twice', () => {
    const s = play('git commit', 'git revert C1')
    expect(s.commits[headSha(s)].change).toBe('-C1')
    expect(errorOf(s, 'git revert C1')).toMatch(/isn't here to undo/)
  })

  it('refuses merge commits', () => {
    const s = play('git switch -c f', 'git commit', 'git switch main', 'git commit', 'git merge f')
    expect(errorOf(s, 'git revert HEAD')).toMatch(/is a merge/)
  })
})

describe('revert -m (undo a whole merge)', () => {
  const merged = ['git switch -c feature', 'git commit', 'git commit', 'git switch main', 'git commit', 'git merge feature']

  it('undoes everything the merge brought in, in one commit', () => {
    const s = play(...merged, 'git revert -m 1 HEAD')
    expect(s.commits[headSha(s)].change).toBe('-C1 -C2')
    expect(s.commits[headSha(s)].message).toBe('Revert "Merge branch \'feature\'"')
  })

  it('re-merging after a revert does nothing; reverting the revert brings it back', () => {
    const s = play(...merged, 'git revert -m 1 HEAD')
    expect(run(s, 'git merge feature').output[0].text).toBe('Already up to date.')
    expect(step(s, 'git revert HEAD').commits[headSha(step(s, 'git revert HEAD'))].change).toBe('C1 C2')
  })

  it('needs -m for merges, and refuses -m for normal commits', () => {
    const s = play(...merged)
    expect(errorOf(s, 'git revert HEAD')).toMatch(/is a merge but no -m/)
    expect(errorOf(s, 'git revert -m 1 HEAD~1')).toMatch(/not a merge/)
  })
})

describe('rebase --onto', () => {
  it('drops a commit from the middle of a branch', () => {
    const s = play('git switch -c feature', 'git commit', 'git commit', 'git commit', 'git rebase --onto C1 C2 feature')
    expect(hist(s)).toEqual(['C0', 'C1', "C3'"])
  })

  it('moves a branch to a new base, leaving the old base behind', () => {
    const s = play('git switch -c exp', 'git commit', 'git switch -c feature', 'git commit', 'git rebase --onto main exp feature')
    expect(hist(s)).toEqual(['C0', "C2'"])
  })
})

describe('ranges', () => {
  const s = play('git switch -c feature', 'git commit', 'git commit', 'git commit', 'git switch main')

  it('cherry-pick A..B copies the commits after A up to B, oldest first', () => {
    expect(hist(step(s, 'git cherry-pick C1..feature'))).toEqual(['C0', "C2'", "C3'"])
  })

  it('revert A..B reverts newest first', () => {
    const r = step(step(s, 'git merge feature'), 'git revert C1..C3')
    expect(hist(r).slice(-2).map((l) => r.commits[resolve(r, l, { labels: true })].change)).toEqual(['-C3', '-C2'])
  })

  it('log A..B shows what B has that A doesn\'t', () => {
    expect(run(s, 'git log --oneline main..feature').output).toHaveLength(3)
  })
})

describe('tag', () => {
  it('creates, refuses duplicates, deletes', () => {
    const s = play('git commit', 'git tag v1 C0')
    expect(label(s, 'v1')).toBe('C0')
    expect(errorOf(s, 'git tag v1')).toMatch(/already exists/)
    expect(step(s, 'git tag -d v1').tags.v1).toBeUndefined()
  })
})

describe('refs', () => {
  it('resolves ~ and ^ suffixes', () => {
    const s = play('git switch -c f', 'git commit', 'git switch main', 'git commit', 'git merge f', 'git commit')
    expect(label(s, 'HEAD~1')).toBe('C3')
    expect(label(s, 'HEAD~1^2')).toBe('C1')
    expect(label(s, 'main~2')).toBe('C2')
    expect(label(s, '@^')).toBe('C3')
  })

  it('resolves sha prefixes of 4+ chars', () => {
    const s = play('git commit')
    expect(resolve(s, headSha(s).slice(0, 4))).toBe(headSha(s))
  })
})

describe('log', () => {
  it('lists newest first with decorations', () => {
    const s = play('git commit', 'git tag v1', 'git branch feature')
    const lines = run(s, 'git log --oneline').output.map((o) => o.text)
    expect(lines[0]).toBe(`${headSha(s)} (HEAD -> main, feature, tag: v1) C1`)
    expect(lines).toHaveLength(2)
  })
})

describe('messages', () => {
  it('stores -m messages and defaults to the label', () => {
    const s = play('git commit -m "Add login page"', 'git commit')
    expect(s.commits[resolve(s, 'C1', { labels: true })].message).toBe('Add login page')
    expect(s.commits[headSha(s)].message).toBe('C2')
    expect(run(s, 'git log --oneline').output[1].text).toMatch(/ Add login page$/)
  })

  it('copies keep the message; reverts and merges get git-style defaults', () => {
    const s = play('git switch -c feature', 'git commit -m "Fix bug"', 'git switch main', 'git commit', 'git cherry-pick C1')
    expect(s.commits[headSha(s)].message).toBe('Fix bug')
    expect(step(s, 'git revert HEAD').commits[headSha(step(s, 'git revert HEAD'))].message).toBe('Revert "Fix bug"')
    const merged = step(s, 'git merge feature')
    expect(merged.commits[headSha(merged)].message).toBe("Merge branch 'feature'")
    const intoDev = play('git switch -c a', 'git commit', 'git switch -c dev main', 'git commit', 'git merge a')
    expect(intoDev.commits[headSha(intoDev)].message).toBe("Merge branch 'a' into dev")
  })
})

describe('show', () => {
  it('prints the full sha, decorations and the change; it is free', () => {
    const s = play('git commit', 'git tag v1')
    const r = run(s, 'git show')
    expect(r.changed).toBe(false)
    const full = fullSha(s, headSha(s))
    expect(full).toMatch(/^[0-9a-f]{40}$/)
    expect(full.startsWith(headSha(s))).toBe(true)
    expect(r.output[0].text).toBe(`commit ${full} (HEAD -> main, tag: v1)`)
    expect(r.output.map((o) => o.text)).toContain('    C1')
  })

  it('shows merge parents and points out copies of the same change', () => {
    const s = play('git switch -c f', 'git commit', 'git switch main', 'git cherry-pick C1', 'git merge f')
    expect(run(s, 'git show').output[1].text).toMatch(/^Merge: [0-9a-f]{7} [0-9a-f]{7}$/)
    const copy = run(s, 'git show HEAD~1').output.map((o) => o.text)
    expect(copy[0]).toMatch(/^commit [0-9a-f]{40}$/)
    expect(copy).toContain('    C1') // a copy keeps the original's message
    expect(copy.some((t) => t.startsWith('Same change as C1'))).toBe(true)
  })

  it('accepts any prefix of the full sha, so pasted shas resolve', () => {
    const s = play('git commit')
    const full = fullSha(s, headSha(s))
    expect(resolve(s, full)).toBe(headSha(s))
    expect(resolve(s, full.slice(0, 12))).toBe(headSha(s))
  })
})

describe('log formats', () => {
  it('defaults to full commit blocks like git', () => {
    const s = play('git commit')
    const lines = run(s, 'git log').output.map((o) => o.text)
    expect(lines[0]).toBe(`commit ${fullSha(s, headSha(s))} (HEAD -> main)`)
    expect(lines).toContain('    C0')
  })
})

describe('remotes', () => {
  /** Like play(), on a cloned repo, with `server:` lines for teammates. */
  function clone(...cmds: string[]): RepoState {
    let s = createRepo('test', { origin: true })
    for (const cmd of cmds) {
      if (cmd.startsWith('server:')) {
        const r = runServer(s, cmd.slice(7).trim())
        if (r.output.length) throw new Error(`${cmd} -> ${r.output[0].text}`)
        s = r.state
      } else s = step(s, cmd)
    }
    return s
  }
  const at = (s: RepoState, ref: string) => s.commits[resolve(s, ref, { labels: true })].label

  it('starts cloned: main tracks origin/main', () => {
    const s = clone()
    expect(at(s, 'origin/main')).toBe('C0')
    expect(run(s, 'git status').output.map((o) => o.text)).toContain("Your branch is up to date with 'origin/main'.")
  })

  it('push moves the server and origin/main; status shows ahead first', () => {
    const s = clone('git commit')
    expect(run(s, 'git status').output.map((o) => o.text)).toContain("Your branch is ahead of 'origin/main' by 1 commit.")
    const pushed = step(s, 'git push')
    expect(pushed.origin!.branches.main).toBe(headSha(pushed))
    expect(at(pushed, 'origin/main')).toBe('C1')
    expect(run(pushed, 'git push').changed).toBe(false) // Everything up-to-date
  })

  it("teammates' commits stay hidden until fetched", () => {
    const s = clone('server: commit main -m "Nikita\'s fix"')
    const sha = s.origin!.branches.main
    expect(s.commits[sha].local).toBe(false)
    expect(run(s, `git show ${sha}`).output[0].kind).toBe('error')
    const fetched = step(s, 'git fetch')
    expect(fetched.commits[sha].local).toBe(true)
    expect(at(fetched, 'origin/main')).toBe('C1')
    expect(hist(fetched, 'main')).toEqual(['C0']) // fetch never moves your branches
    expect(run(fetched, 'git fetch').changed).toBe(false)
  })

  it('push is rejected when origin has work you lack', () => {
    const s = clone('server: commit main', 'git commit')
    expect(errorOf(s, 'git push')).toMatch(/rejected.*fetch first/)
    expect(errorOf(step(s, 'git fetch'), 'git push')).toMatch(/non-fast-forward/)
  })

  it('pull fast-forwards, refuses to guess on divergence, and can rebase or merge', () => {
    expect(hist(clone('server: commit main', 'git pull'))).toEqual(['C0', 'C1'])
    const diverged = clone('server: commit main', 'git commit')
    expect(errorOf(diverged, 'git pull')).toMatch(/Need to specify how to reconcile divergent branches/)
    expect(hist(step(diverged, 'git pull --rebase'))).toEqual(['C0', 'C1', "C2'"])
    const merged = step(diverged, 'git pull --no-rebase')
    expect(merged.commits[headSha(merged)].parents).toHaveLength(2)
  })

  it('force-with-lease refuses when someone pushed since your last fetch; --force does not care', () => {
    const s = clone('git commit', 'git push', 'git commit --allow-empty', 'git reset --hard C0', 'git commit')
    expect(step(s, 'git push --force-with-lease').origin!.branches.main).toBe(headSha(s))
    const raced = runServer(s, 'commit main').state
    expect(errorOf(raced, 'git push --force-with-lease')).toMatch(/stale info/)
    expect(step(raced, 'git push --force').origin!.branches.main).toBe(headSha(raced))
  })

  it('push -u sets the upstream; switch creates a tracking branch from origin/<b>', () => {
    const s = clone('git switch -c feature', 'git commit', 'git push -u origin feature')
    expect(s.upstream.feature).toBe('feature')
    const other = clone('server: branch review C0', 'git fetch', 'git switch review')
    expect(other.upstream.review).toBe('review')
    expect(other.head).toEqual({ type: 'branch', name: 'review' })
  })

  it('server pull-request merges and @{u}', () => {
    const s = clone('git switch -c f1', 'git commit', 'git push -u origin f1', 'server: merge f1 into main', 'git switch main', 'git pull')
    expect(s.commits[headSha(s)].message).toBe('Merge pull request #1 from team/f1')
    expect(at(s, '@{u}')).toBe(at(s, 'origin/main'))
  })

  it('branch -m renames locally only; plain push then refuses until you push the new name', () => {
    const s = clone('git switch -c feature', 'git commit', 'git push -u origin feature', 'git branch -m login-page')
    expect(s.head).toEqual({ type: 'branch', name: 'login-page' })
    expect(s.branches.feature).toBeUndefined()
    expect(s.upstream['login-page']).toBe('feature') // still tracks the old name
    expect(s.origin!.branches.feature).toBeDefined() // origin still has it
    expect(errorOf(s, 'git push')).toMatch(/does not match the name of your current branch/)
    const pushed = step(step(s, 'git push -u origin HEAD'), 'git push origin --delete feature')
    expect(pushed.origin!.branches['login-page']).toBe(headSha(pushed))
    expect(pushed.origin!.branches.feature).toBeUndefined()
    expect(pushed.upstream['login-page']).toBe('login-page')
    expect(errorOf(clone('git branch x'), 'git branch -m x main')).toMatch(/already exists/)
  })

  it('deleting a server branch, and pruning it', () => {
    const s = clone('git switch -c tmp', 'git push -u origin tmp', 'git push origin --delete tmp')
    expect(s.origin!.branches.tmp).toBeUndefined()
    expect(s.remoteTracking.tmp).toBeUndefined()
  })
})

describe('input handling', () => {
  it('tokenises quotes but leaves primes alone', () => {
    expect(tokenize(`git commit -m "two words"`)).toEqual(['git', 'commit', '-m', 'two words'])
    expect(tokenize(`git cherry-pick C4'`)).toEqual(['git', 'cherry-pick', "C4'"])
  })

  it('explains unsupported commands', () => {
    const s = createRepo()
    expect(errorOf(s, 'git add .')).toMatch(/no files/)
    expect(errorOf(s, 'git push')).toMatch(/'origin' does not appear/)
    expect(errorOf(s, 'ls')).toMatch(/only speaks git/)
    expect(errorOf(s, 'git frobnicate')).toMatch(/not a git command/)
    expect(errorOf(s, 'git commit --wat')).toMatch(/unknown option/)
  })

  it('ignores empty input', () => {
    expect(run(createRepo(), '   ').output).toEqual([])
  })
})
