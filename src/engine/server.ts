import { fail, GitError } from './errors'
import { ancestors, canApply } from './graph'
import { tokenize, parseArgs } from './parse'
import { resolve } from './refs'
import { copyCommit, newCommit } from './repo'
import type { OutputLine, RepoState, Sha } from './state'

/**
 * Level setups only: things teammates do on origin before the level starts ("server: …" lines).
 * They change the server's branches, never yours, and their commits stay hidden until fetched.
 *
 *   server: commit <branch> [-m "msg"]           a teammate pushed a commit
 *   server: merge <from> into <into>             a pull request was merged (merge commit)
 *   server: rebase-merge <from> into <into>      "rebase and merge" (copies on top)
 *   server: rebase <branch> onto <base>          someone rebased <branch> and force-pushed it
 *   server: branch <name> <ref>                  a teammate pushed a new branch
 *   server: force <branch> <ref>                 someone force-pushed
 *   server: delete <branch>                      a branch was deleted on the server
 */
export function runServer(state: RepoState, directive: string): { state: RepoState; output: OutputLine[] } {
  const s = structuredClone(state)
  try {
    if (!s.origin) fail('server: this level has no origin (add `origin: true`)')
    const origin = s.origin
    const [verb, ...args] = tokenize(directive)
    // refs on the server's side: its branch names first, then labels / anything resolvable
    const at = (ref: string): Sha => origin.branches[ref] ?? resolve(s, ref, { labels: true })
    const branchTip = (b: string) => origin.branches[b] ?? fail(`server: origin has no branch '${b}'`)

    switch (verb) {
      case 'commit': {
        const { options, positional } = parseArgs(args, { options: { '-m': 'message' } })
        const b = positional[0] ?? fail('server: commit needs a branch')
        const c = newCommit(s, [branchTip(b)], { message: options.message, local: false })
        origin.branches[b] = c.sha
        break
      }
      case 'merge': {
        const [from, into] = [args[0], args[2]]
        if (args[1] !== 'into' || !from || !into) fail('server: merge <from> into <into>')
        const n = ++origin.pullRequests
        const c = newCommit(s, [branchTip(into), branchTip(from)], {
          change: '',
          message: `Merge pull request #${n} from team/${from}`,
          local: false,
        })
        origin.branches[into] = c.sha
        break
      }
      case 'rebase-merge':
      case 'rebase': {
        // both copy <from>'s own commits onto <base>; rebase-merge moves <base> (a PR landing), rebase moves <from>
        const word = verb === 'rebase' ? 'onto' : 'into'
        const [from, base] = [args[0], args[2]]
        if (args[1] !== word || !from || !base) fail(`server: ${verb} <branch> ${word} <branch>`)
        const baseHistory = ancestors(s, branchTip(base))
        let tip = branchTip(base)
        const commits = [...ancestors(s, branchTip(from))]
          .filter((c) => !baseHistory.has(c))
          .map((c) => s.commits[c])
          .filter((c) => c.parents.length < 2)
          .sort((a, b) => a.seq - b.seq)
        for (const c of commits) {
          if (!canApply(s, tip, c.change)) continue
          tip = copyCommit(s, c, tip, false).sha
        }
        origin.branches[verb === 'rebase' ? from : base] = tip
        break
      }
      case 'branch':
      case 'force': {
        const [b, ref] = args
        if (!b || !ref) fail(`server: ${verb} <branch> <ref>`)
        origin.branches[b] = at(ref)
        break
      }
      case 'delete': {
        if (!args[0]) fail('server: delete <branch>')
        branchTip(args[0])
        delete origin.branches[args[0]]
        break
      }
      default:
        fail(`server: unknown directive '${verb}'`)
    }
    return { state: s, output: [] }
  } catch (e) {
    if (e instanceof GitError) return { state, output: e.lines.map((text) => ({ kind: 'error', text })) }
    throw e
  }
}
