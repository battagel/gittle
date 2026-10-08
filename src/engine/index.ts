import { branch } from './commands/branch'
import { checkout } from './commands/checkout'
import { cherryPick } from './commands/cherryPick'
import { commit } from './commands/commit'
import { help } from './commands/help'
import { log } from './commands/log'
import { merge } from './commands/merge'
import { rebase } from './commands/rebase'
import { reset } from './commands/reset'
import { revert } from './commands/revert'
import { fetch, pull, push, remote } from './commands/remote'
import { describe, mergeBase, npmTest, reflog } from './commands/inspect'
import { bisect } from './commands/bisect'
import { show } from './commands/show'
import { status } from './commands/status'
import { switchCmd } from './commands/switch'
import { tag } from './commands/tag'
import { GitError, fail } from './errors'
import { tokenize } from './parse'
import { Ctx, sameRepo } from './repo'
import type { OutputLine, RepoState, RunOptions, RunResult } from './state'

export * from './state'
export { createRepo, headSha, currentBranch, stateKey } from './repo'
export { firstParentLabels } from './graph'
export { runServer } from './server'

const commands: Record<string, (ctx: Ctx, args: string[]) => void> = {
  commit,
  branch,
  switch: switchCmd,
  checkout,
  merge,
  rebase,
  'cherry-pick': cherryPick,
  reset,
  revert,
  tag,
  log,
  show,
  status,
  fetch,
  pull,
  push,
  remote,
  reflog,
  'merge-base': mergeBase,
  describe,
  bisect,
}

const noFiles = ['add', 'stash', 'diff', 'restore', 'rm', 'mv', 'clean', 'blame']
const noRemotes = ['clone']

/** Run one line of input. Pure: never mutates `state`. */
export function run(state: RepoState, input: string, opts: RunOptions = {}): RunResult {
  const ctx = new Ctx(structuredClone(state), opts)
  try {
    dispatch(ctx, input)
  } catch (e) {
    if (!(e instanceof GitError)) throw e
    const output: OutputLine[] = [
      ...e.lines.map((text) => ({ kind: 'error' as const, text })),
      ...e.hints.map((text) => ({ kind: 'hint' as const, text })),
    ]
    return { state, output, changed: false, effects: [] }
  }
  const changed = !sameRepo(state, ctx.state)
  // Bookkeeping that isn't a stroke (where `git switch -` goes, reflogs, bisect marks) still has to stick.
  const bookkeeping = (x: RepoState) => JSON.stringify([x.previous, x.reflogs, x.bisect, x.bisected])
  const touched = changed || bookkeeping(ctx.state) !== bookkeeping(state)
  return { state: touched ? ctx.state : state, output: ctx.output, changed, effects: changed ? ctx.effects : [] }
}

function dispatch(ctx: Ctx, input: string) {
  const tokens = tokenize(input)
  if (!tokens.length) return
  const [program, name, ...args] = tokens

  if (program === 'help') return help(ctx, name)
  if (program === 'npm') return npmTest(ctx, tokens.slice(1))
  if (program !== 'git') fail(`gittle only speaks git: '${program}' isn't a git command.`, 'Try `help`.')
  if (!name || name === 'help' || name === '--help') return help(ctx, args[0])
  if (args.includes('-h') || args.includes('--help')) return help(ctx, name)

  const cmd = commands[name]
  if (cmd) return cmd(ctx, args)
  if (noFiles.includes(name)) fail(`\`git ${name}\` isn't needed in gittle. There are no files here, only commits!`)
  if (noRemotes.includes(name)) fail(`\`git ${name}\` isn't needed: every level starts with the repo already there.`)
  fail(`git: '${name}' is not a git command. See 'git help'.`)
}
