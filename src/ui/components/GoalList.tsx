import type { RepoState } from '../../engine'
import { evaluate } from '../../levels/goal'
import type { Level } from '../../levels/load'
import { Brief } from './Brief'

/** The level's goal checks, ticked live as the repo changes. */
export function GoalList({ level, repo }: { level: Level; repo: RepoState }) {
  return (
    <ul className="space-y-1.5">
      {evaluate(level, repo).map(({ text, ok }, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span
            className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold transition ${
              ok ? 'bg-mint text-white' : 'ring-1 ring-line'
            }`}
          >
            {ok && '✓'}
          </span>
          <span className={ok ? 'text-muted' : ''}>
            <Brief text={text} inline />
          </span>
        </li>
      ))}
    </ul>
  )
}
