import { fail } from '../errors'
import type { Ctx } from '../repo'

export const usage: Record<string, string[]> = {
  commit: ['git commit [-m "<message>"]', 'Make a new commit on top of HEAD.'],
  branch: [
    'git branch [<name> [<start>]]  |  git branch -d|-D <name>  |  git branch -f <name> <ref>',
    'List, create, delete or move branches. A branch is just a label on a commit.',
  ],
  switch: [
    'git switch <branch>  |  git switch -  |  git switch -c <name> [<start>]  |  git switch --detach <ref>',
    'Move HEAD to a branch (or a commit). `git switch -` jumps back to where you were before, like `cd -`.',
  ],
  checkout: ['git checkout <ref>  |  git checkout -  |  git checkout -b <name> [<start>]', 'The older way to switch branches or detach HEAD.'],
  merge: ['git merge <ref> [--no-ff]', 'Bring another branch into this one: fast-forward if possible, otherwise a merge commit.'],
  rebase: [
    'git rebase <upstream> [<branch>]  |  git rebase --onto <newbase> <upstream> [<branch>]',
    'Replay your commits on top of <upstream> (or of <newbase>: the commits after <upstream>). The copies get new shas.',
  ],
  'cherry-pick': ['git cherry-pick <sha>...  |  git cherry-pick A..B', 'Copy the change from commits onto HEAD. A..B = the commits after A, up to B.'],
  reset: [
    'git reset [--soft|--mixed|--hard] <ref>',
    'Move the current branch to <ref>. With no files in gittle, all three modes do the same thing.',
  ],
  revert: ['git revert <sha>...  |  git revert -m 1 <merge>', 'Make a new commit that undoes <sha>, or a whole merge. Safe for shared history.'],
  tag: ['git tag [<name> [<ref>]]  |  git tag -d <name>', 'List, create or delete tags: labels that never move.'],
  log: ['git log [--oneline] [--all] [<ref> | A..B]', 'Show the commits reachable from a ref, or what B has that A doesn\'t.'],
  show: ['git show [<ref>...]', 'Show a commit: its full sha, parents and the change it carries.'],
  status: ['git status', 'Show where HEAD is, and how your branch compares with origin.'],
  fetch: ['git fetch [--prune]', "Download what's new on origin into origin/* (your branches don't move)."],
  pull: ['git pull [--rebase | --no-rebase | --ff-only]', "Fetch, then bring your branch's upstream into it."],
  push: [
    'git push  |  git push -u origin <branch>  |  git push --force-with-lease  |  git push origin --delete <branch>',
    'Send your branch to origin. Rejected if origin has work you don\'t; --force-with-lease overwrites only if nobody else pushed.',
  ],
  remote: ['git remote [-v]', 'List remotes (just origin).'],
}

export function help(ctx: Ctx, topic?: string) {
  if (topic) {
    const u = usage[topic]
    if (!u) fail(`No help for '${topic}'. Try \`help\` for a list of commands.`)
    ctx.info(`usage: ${u[0]}`)
    ctx.hint(u[1])
    return
  }
  ctx.info('gittle understands these git commands:')
  for (const [name, [, desc]] of Object.entries(usage)) ctx.info(`  ${name.padEnd(12)} ${desc}`)
  ctx.hint('`git help <command>` for details. Commands that change the repo cost a stroke; help, log and status are free.')
}
