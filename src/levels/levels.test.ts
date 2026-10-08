import { describe, expect, it } from 'vitest'
import { createRepo, run } from '../engine'
import { evaluate, isSolved, parseCheck } from './goal'
import { hintCommands, planHint } from './hints'
import { levelPoints } from './progress'
import { migrate } from '../storage'
import { catalogue, getLevel, hintsAllowed, levelFiles, parseLevel, playAll } from './load'

const parsed = Object.entries(levelFiles).map(([path, source]) => ({ path, level: () => parseLevel(path, source) }))

describe('level files', () => {
  it('exist', () => expect(parsed.length).toBeGreaterThan(0))

  it('have unique titles, since progress is saved by a key from the title', () => {
    const keys = parsed.map((p) => p.level().key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('move old id-keyed progress to the stable keys', () => {
    const data = migrate({ version: 1, settings: {}, progress: { E01: { best: 1, completedAt: '' }, 'other-key': { best: 2, completedAt: '' } } })
    expect(Object.keys(data.progress).sort()).toEqual(['other-key', 'your-first-commit'])
  })

  it('have unique ids', () => {
    const ids = parsed.map((p) => p.level().id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  describe.each(parsed)('$path', ({ level: load }) => {
    it('parses, and setup + solution run cleanly', () => {
      expect(load).not.toThrow()
    })

    it('is not already solved by the setup', () => {
      const level = load()
      expect(isSolved(level, level.start)).toBe(false)
    })

    it('every solution step is a stroke, and the solution wins in par', () => {
      const level = load()
      let state = level.start
      for (const step of level.solution) {
        const r = run(state, step, { labels: true })
        expect(r.changed, `"${step}" should change the repo`).toBe(true)
        state = r.state
      }
      expect(evaluate(level, state).filter((c) => !c.ok)).toEqual([])
      expect(level.par).toBe(level.solution.length)
    })

    it('hint commands use shas only and replay to a win', () => {
      const level = load()
      let state = level.start
      for (const cmd of hintCommands(level, level.solution.length)) {
        expect(cmd).not.toMatch(/\bC\d+'*\b/)
        const r = run(state, cmd) // no labels: exactly what a player could type
        expect(r.output.find((o) => o.kind === 'error')).toBeUndefined()
        state = r.state
      }
      expect(isSolved(level, state)).toBe(true)
    })
  })
})

describe('goals', () => {
  const play = (id: string, cmds: string[]) => {
    const level = getLevel(id)!
    return { level, state: playAll(level.start, cmds, 'test') }
  }

  it('accepts any route that does what the brief asks (the extra commit only costs a stroke)', () => {
    const { level, state } = play('E02', ['git commit', 'git switch -c feature', 'git commit'])
    expect(isSolved(level, state)).toBe(true)
  })

  it('rejects routes that miss the point of the level', () => {
    // cherry-picking the fix is right; merging the whole branch is not
    expect(isSolved(...pair(play('M03', ['git cherry-pick C3'])))).toBe(true)
    expect(isSolved(...pair(play('M03', ['git merge feature'])))).toBe(false)
    // resetting rewrites shared history; reverting doesn't
    expect(isSolved(...pair(play('M05', ['git revert C2'])))).toBe(true)
    expect(isSolved(...pair(play('M05', ['git reset --hard C1', 'git cherry-pick C3'])))).toBe(false)
    // and the reverse lesson for private history
    expect(isSolved(...pair(play('M04', ['git revert C3', 'git revert C2'])))).toBe(false)
  })

  it('describes each check and whether it passes', () => {
    const { level, state } = play('E02', ['git switch -c feature'])
    expect(evaluate(level, state)).toEqual([
      { text: 'HEAD is on `feature`', ok: true },
      { text: '`feature` is ahead of `main`', ok: false },
      { text: '`feature` is ahead of C1', ok: false },
    ])
  })

  it('counts copies as the same change', () => {
    const level = parseLevel(
      'M99.yaml',
      'title: t\ndifficulty: medium\nbrief: b\nsetup: ["git switch -c f", "git commit", "git switch main"]\nsolution: ["git cherry-pick C1"]\ngoal: [{ contains: { ref: main, changes: [C1] } }]',
    )
    expect(isSolved(level, level.target)).toBe(true)
  })

  it('rejects malformed goals and unknown refs', () => {
    expect(() => parseCheck({ ahead: { ref: 'x' } }, 0)).toThrow(/of must be a string/)
    expect(() => parseCheck({ frobnicate: 'x' }, 0)).toThrow(/unknown check/)
    expect(() =>
      parseLevel('E99.yaml', 'title: t\ndifficulty: easy\nbrief: b\nsolution: ["git commit"]\ngoal: [{ head: mian }]'),
    ).toThrow(/unknown ref "mian"/)
  })

  it('evaluates against the start state labels', () => {
    const level = { start: createRepo('x'), goal: [parseCheck({ unchanged: 'main' }, 0)] }
    expect(isSolved(level, level.start)).toBe(true)
    expect(isSolved(level, run(level.start, 'git commit').state)).toBe(false)
  })
})

const pair = ({ level, state }: { level: ReturnType<typeof getLevel> & {}; state: ReturnType<typeof playAll> }) =>
  [level, state] as const

describe('daily challenges', () => {
  const make = (date: string, i: number) =>
    parseLevel(
      `P9${i}.yaml`,
      `title: t\ndifficulty: pro\ndaily-date: ${date}\nbrief: b\nsolution: ["git commit"]\ngoal: [{ ahead: { ref: main, of: C0 } }]`,
    )

  it('lists past dailies and today\'s, features today\'s, hides future ones', () => {
    const [past, today, future] = ['2026-10-07', '2026-10-08', '2026-10-09'].map(make)
    const { levels, daily } = catalogue([future, today, past], '2026-10-08')
    expect(daily).toBe(today)
    expect(levels).toEqual([past, today])
  })

  it('must be medium or pro', () => {
    expect(() =>
      parseLevel('E98.yaml', 'title: t\ndifficulty: easy\ndaily-date: 2026-10-08\nbrief: b\nsolution: ["git commit"]\ngoal: [{ head: main }]'),
    ).toThrow(/medium or pro/)
  })

  it('checks the name matches the difficulty and the date is well-formed', () => {
    const body = (extra: string) => `title: t\n${extra}\nbrief: b\nsolution: ["git commit"]\ngoal: [{ head: main }]`
    expect(() => parseLevel('M98.yaml', body('difficulty: pro'))).toThrow(/must start with P/)
    expect(() => parseLevel('P98.yaml', body('difficulty: pro\ndaily-date: tomorrow'))).toThrow(/daily-date/)
    expect(() => parseLevel('levels/first.yaml', body('difficulty: pro'))).toThrow(/named like E01/)
  })

  it('can reveal every level, future ones included', () => {
    const [past, today, future] = ['2026-10-07', '2026-10-08', '2026-10-09'].map(make)
    expect(catalogue([future, today, past], '2026-10-08', true).levels).toEqual([past, today, future])
  })

  it('every daily has its own date', () => {
    const dates = parsed.map((p) => p.level().daily).filter((d) => d !== null)
    expect(new Set(dates).size).toBe(dates.length)
  })
})

describe('hints', () => {
  it('are off for a daily on its own day only', () => {
    const daily = getLevel('P11')!
    expect(hintsAllowed(daily, daily.daily!)).toBe(false)
    expect(hintsAllowed(daily, '2099-01-01')).toBe(true)
    expect(hintsAllowed(getLevel('E01')!, daily.daily!)).toBe(true)
  })

  const level = getLevel('E04')! // solution: switch main, commit, switch -

  it('types the next step when the repo is still on the solution path', () => {
    const first = planHint(level, level.start, 0)
    expect(first).toMatchObject({ reset: false, hintsUsed: 1, commands: ['git switch main'] })
    const after1 = run(level.start, first.commands[0]).state
    const second = planHint(level, run(after1, 'git log').state, 1) // free commands don't count as changes
    expect(second).toMatchObject({ reset: false, hintsUsed: 2 })
    expect(second.commands[0]).toMatch(/^git commit/)
  })

  it('picks up where the player got to on their own', () => {
    const typed = run(level.start, 'git checkout main').state // same state as the first step
    expect(planHint(level, typed, 0)).toMatchObject({ reset: false, hintsUsed: 2 })
  })

  it('resets and replays one step further when the player has changed things', () => {
    const changed = run(level.start, 'git commit').state
    const plan = planHint(level, changed, 1)
    expect(plan).toMatchObject({ reset: true, hintsUsed: 2 })
    expect(plan.commands).toHaveLength(2)
  })
})

describe('score', () => {
  const level = getLevel('E01')!
  it('doubles a daily solved on its day, keeping whichever is better', () => {
    expect(levelPoints(level, undefined)).toBeNull()
    expect(levelPoints(level, { best: 2, completedAt: '' })).toBe(70)
    expect(levelPoints(level, { best: 1, dayBest: 2, completedAt: '' })).toBe(140)
    expect(levelPoints(level, { best: 1, dayBest: 1, completedAt: '' })).toBe(200)
  })
})
