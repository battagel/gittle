import { describe, expect, it } from 'vitest'
import { levelFiles, parseLevel } from './load'
import { readable, search } from './search'
import { specialFeature } from './special'

// Par = the shortest solution using basic commands only (see special.ts). Shortcuts can beat it: that's a birdie.
describe('par', () => {
  it('flags shortcut forms and allows basic ones', () => {
    for (const cmd of ['git switch -c x', 'git checkout -b x', 'git branch -f main C2', 'git rebase main feature',
      'git rebase --onto C1 C2', 'git cherry-pick C2 C3', 'git cherry-pick C1..C3', 'git revert C1..C3', 'git branch -d a b']) {
      expect(specialFeature(cmd), cmd).not.toBeNull()
    }
    for (const cmd of ['git switch x', 'git branch x C2', 'git rebase main', 'git cherry-pick C2', 'git revert -m 1 C5',
      'git commit -m "a b"', 'git branch -d a', 'git reset --hard HEAD~2', 'git switch -', 'git merge feature']) {
      expect(specialFeature(cmd), cmd).toBeNull()
    }
  })

  it('catches a padded solution (sanity check for the search)', () => {
    const padded = parseLevel(
      'E99.yaml',
      'title: t\ndifficulty: easy\nbrief: b\nsolution: ["git branch x", "git commit", "git switch x", "git switch main"]\ngoal: [{ head: main }, { ahead: { ref: main, of: C0 } }, { points-to: { branch: x, commit: C0 } }]',
    )
    expect(search(padded, padded.par - 1, 1, 300_000, { basic: true }).routes[0]).toHaveLength(2)
  })

  describe.each(Object.entries(levelFiles))('%s', (path, source) => {
    const level = () => parseLevel(path, source)

    it('the solution uses basic commands only', () => {
      expect(level().solution.map((c) => [c, specialFeature(c)]).filter(([, why]) => why)).toEqual([])
    })

    it('no shorter solution exists with basic commands', () => {
      const l = level()
      const { routes, depth } = search(l, l.par - 1, 1, 300_000, { basic: true })
      expect(routes.map((r) => readable(l, r)), 'a shorter basic route wins: tighten the goal or update the solution').toEqual([])
      expect(depth, 'the search should cover at least 2 strokes').toBeGreaterThanOrEqual(Math.min(2, l.par - 1))
    }, 120_000)
  })
})
