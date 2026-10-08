import { fail } from '../errors'
import type { Ctx } from '../repo'

export const usage: Record<string, string[]> = {
  commit: ['git commit [-m "<message>"]', 'Make a new commit on top of HEAD.'],
  branch: [
    'git branch [<name> [<start>]]  |  git branch -d|-D <name>  |  git branch -f <name> <ref>  |  git branch -m [<old>] <new>',
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
  log: [
    'git log [--oneline] [--all] [--first-parent] [-n <k>] [--grep <text>] [<ref> | A..B | A...B --left-right]',
    'Show the commits reachable from a ref, what B has that A doesn\'t, or what either has that the other doesn\'t.',
  ],
  show: ['git show [<ref>...]', 'Show a commit: its full sha, parents and the change it carries.'],
  status: ['git status', 'Show where HEAD is, and how your branch compares with origin.'],
  fetch: ['git fetch [--prune]', "Download what's new on origin into origin/* (your branches don't move)."],
  pull: ['git pull [--rebase | --no-rebase | --ff-only]', "Fetch, then bring your branch's upstream into it."],
  push: [
    'git push  |  git push -u origin <branch>  |  git push --force-with-lease  |  git push origin --delete <branch>',
    'Send your branch to origin. Rejected if origin has work you don\'t; --force-with-lease overwrites only if nobody else pushed.',
  ],
  remote: ['git remote [-v]', 'List remotes (just origin).'],
  reflog: ['git reflog [show <branch>]', 'Where HEAD (or a branch) has pointed, newest first: use HEAD@{n} / main@{n} as refs.'],
  'merge-base': ['git merge-base <a> <b>  |  git merge-base --is-ancestor <a> <b>', 'The best common ancestor: where two lines of work split.'],
  describe: ['git describe [--tags] [<commit>]', 'Name a commit by the nearest tag: v1.2-3-gabc1234 = 3 commits after v1.2.'],
  bisect: [
    'git bisect start  |  git bisect bad / good [<commit>]  |  git bisect run npm test  |  git bisect reset',
    'Binary-search for the commit that broke things. `npm test` tells you whether the commit you are on is good.',
  ],
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
