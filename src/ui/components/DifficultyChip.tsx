import type { Difficulty } from '../../levels/load'

const colour: Record<Difficulty, string> = {
  easy: 'bg-mint',
  medium: 'bg-amber',
  pro: 'bg-coral',
}

export function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
      <span className={`size-2 rounded-full ${colour[difficulty]}`} />
      {difficulty}
    </span>
  )
}
