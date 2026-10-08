/**
 * Points for a finished level: 100 at par, +25 for each stroke under par (birdie 125, eagle 150…),
 * and 30% less for each stroke over (70, 49, 34…), never below 10.
 */
export function points(strokes: number, par: number): number {
  if (strokes < par) return 100 + 25 * (par - strokes)
  return Math.max(10, Math.round(100 * 0.7 ** (strokes - par)))
}

/** Daily challenges are worth double when solved on their own day. */
export const DAILY_BONUS = 2

// Golf-style result for a finished level (docs/levels.md#scoring).
export function golfResult(strokes: number, par: number): string {
  if (strokes === 1 && par >= 2) return 'Hole in one!'
  const diff = strokes - par
  switch (diff) {
    case -4: return 'Condor'
    case -3: return 'Albatross'
    case -2: return 'Eagle'
    case -1: return 'Birdie'
    case 0: return 'Par'
    case 1: return 'Bogey'
    case 2: return 'Double bogey'
    case 3: return 'Triple bogey'
  }
  return diff < 0 ? `${diff}` : `+${diff}`
}
