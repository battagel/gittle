import { run, stateKey, type RepoState } from '../engine'
import type { Level } from './load'

/** Swap commit labels (C2, C2'~1, C2..C5) for the shas a player would type. */
export function toPlayerCommand(state: RepoState, cmd: string): string {
  const shaOf = new Map(Object.values(state.commits).map((c) => [c.label, c.sha]))
  return cmd.replace(/(?<![\w-])C\d+'*(?=$|[~^.\s])/g, (label) => shaOf.get(label) ?? label)
}

/** The first `steps` solution steps, as the player would type them from the level's start. */
export function hintCommands(level: Level, steps: number): string[] {
  const out: string[] = []
  let state = level.start
  for (const step of level.solution.slice(0, steps)) {
    const cmd = toPlayerCommand(state, step)
    out.push(cmd)
    state = run(state, cmd).state
  }
  return out
}

export interface HintPlan {
  reset: boolean // start over from the level's start first
  commands: string[] // what to type, in order
  hintsUsed: number // solution steps revealed so far
}

/**
 * What the hint button should do. If the repo is exactly where some prefix of the solution leaves it (the player
 * hasn't changed anything, or did the same steps themselves), just type the next step. Otherwise reset and replay
 * one step further than before.
 */
export function planHint(level: Level, current: RepoState, hintsUsed: number): HintPlan {
  const n = level.solution.length
  const states = [level.start]
  const commands = hintCommands(level, n)
  for (const cmd of commands) states.push(run(states[states.length - 1], cmd).state)

  const here = stateKey(current)
  for (let j = n - 1; j >= 0; j--) {
    if (stateKey(states[j]) === here) return { reset: false, commands: [commands[j]], hintsUsed: Math.max(hintsUsed, j + 1) }
  }
  const k = Math.min(hintsUsed + 1, n)
  return { reset: true, commands: commands.slice(0, k), hintsUsed: k }
}
