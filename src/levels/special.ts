import { tokenize } from '../engine/parse'

/**
 * Par counts only basic commands: one action per command, the way you first learn git. These shortcut forms
 * don't count towards par, so players who know them can beat it (birdies, eagles…).
 * Returns why `cmd` is a shortcut, or null if it's basic.
 */
export function specialFeature(cmd: string): string | null {
  const [, sub, ...rest] = tokenize(cmd)
  // drop option values so only real arguments remain (-m <n> for revert, -m <msg> for commit/merge)
  const args = rest.filter((_, i) => !(rest[i - 1] === '-m' || rest[i - 1] === '--mainline'))
  const flags = args.filter((a) => a.startsWith('-') && a !== '-')
  const positional = args.filter((a) => !a.startsWith('-') || a === '-')
  const has = (...f: string[]) => flags.some((x) => f.includes(x))

  switch (sub) {
    case 'switch':
      if (has('-c', '-C', '--create', '--force-create')) return 'creates and switches in one command'
      break
    case 'checkout':
      if (has('-b', '-B')) return 'creates and switches in one command'
      break
    case 'branch':
      if (has('-f', '--force')) return 'moves a branch without switching to it'
      if (has('-d', '-D', '--delete') && positional.length > 1) return 'deletes several branches at once'
      break
    case 'rebase':
      if (has('--onto')) return 'rebase --onto'
      if (positional.length > 1) return 'switches and rebases in one command'
      break
    case 'pull':
      if (positional.length > 1) return 'pulls a branch other than your upstream in one command'
      break
    case 'bisect':
      if (positional[0] === 'run') return 'runs the whole bisect in one command'
      break
    case 'cherry-pick':
    case 'revert':
      if (positional.length > 1 || positional.some((p) => p.includes('..'))) return 'takes several commits at once'
      break
  }
  return null
}
