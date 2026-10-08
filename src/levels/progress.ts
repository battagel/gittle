import type { Progress, SaveData } from '../storage'
import { dailyToday, levelName, levels, type Level } from './load'
import { DAILY_BONUS, points } from './score'

/** A solved level's points: its best result, or double its best on the day for a daily, whichever is more. */
export function levelPoints(level: Level, progress: Progress | undefined): number | null {
  if (!progress) return null
  const onDay = progress.dayBest === undefined ? 0 : DAILY_BONUS * points(progress.dayBest, level.par)
  return Math.max(points(progress.best, level.par), onDay)
}

/** Total score across every visible level, including today's daily. */
export function totalScore(save: SaveData): number {
  return [...levels, ...(dailyToday ? [dailyToday] : [])].reduce(
    (sum, level) => sum + (levelPoints(level, save.progress[level.id]) ?? 0),
    0,
  )
}

/** Where "Next" goes after a level: the next one in the list, or back to the list after today's daily. */
export function afterLevel(level: Level, next: Level | undefined): { to: string; label: string } {
  if (dailyToday?.id === level.id) return { to: '/levels', label: 'Back to levels' }
  return next ? { to: `/play/${next.id}`, label: `Next: ${levelName(next)}` } : { to: '/levels', label: 'All levels done' }
}

export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
