import { parse } from 'yaml'
import { createRepo, run, runServer, type RepoState } from '../engine'
import { mentions, parseCheck, type Check } from './goal'

export type Difficulty = 'easy' | 'medium' | 'pro'
export const difficulties: Difficulty[] = ['easy', 'medium', 'pro']
const prefix: Record<Difficulty, string> = { easy: 'E', medium: 'M', pro: 'P' }

export interface Level {
  id: string // the filename: levels/E01.yaml -> "E01" (E/M/P + number)
  order: number // the number in the id
  daily: string | null // `daily-date`: "2026-10-08" for a daily challenge, null otherwise
  title: string
  difficulty: Difficulty
  concepts: string[]
  brief: string
  setup: string[]
  solution: string[]
  goal: Check[]
  origin: boolean // starts as a clone of a remote
  par: number
  start: RepoState // after setup
  target: RepoState // after setup + solution: what hints replay towards
}

/** Run commands as a level author (labels allowed, `server:` lines for teammates); any error is a broken level. */
export function playAll(state: RepoState, commands: string[], what: string): RepoState {
  for (const cmd of commands) {
    const r = cmd.startsWith('server:') ? runServer(state, cmd.slice(7).trim()) : run(state, cmd, { labels: true })
    const err = r.output.find((o) => o.kind === 'error')
    if (err) throw new Error(`${what} step "${cmd}" failed: ${err.text}`)
    state = r.state
  }
  return state
}

/** Setup steps: git commands, plus `- server: …` lines (which YAML reads as `{ server: '…' }`). */
const commandList = (v: unknown, field: string): string[] => {
  if (v == null) return []
  if (!Array.isArray(v)) throw new Error(`\`${field}\` must be a list`)
  return v.map((x, i) => {
    if (typeof x === 'string') return x
    if (x && typeof x === 'object' && Object.keys(x).length === 1 && typeof (x as { server?: unknown }).server === 'string') {
      return `server: ${(x as { server: string }).server}`
    }
    throw new Error(`\`${field}[${i}]\` must be a git command or a \`server: …\` line`)
  })
}

const stringList = (v: unknown, field: string): string[] => {
  if (v == null) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`\`${field}\` must be a list of strings`)
  return v
}

export function parseLevel(path: string, source: string): Level {
  try {
    const m = /(?:^|\/)(([EMP])(\d{2,}))\.yaml$/.exec(path)
    if (!m) throw new Error('file must be named like E01.yaml, M01.yaml or P01.yaml')
    const [, id, letter, number] = m

    const data = parse(source)
    if (!data || typeof data !== 'object') throw new Error('file is empty')
    const { title, difficulty, brief } = data
    if (typeof title !== 'string') throw new Error('`title` is required')
    if (!difficulties.includes(difficulty)) throw new Error('`difficulty` must be easy, medium or pro')
    if (prefix[difficulty as Difficulty] !== letter) throw new Error(`a ${difficulty} level's name must start with ${prefix[difficulty as Difficulty]}`)
    if (typeof brief !== 'string') throw new Error('`brief` is required')

    const date = data['daily-date'] ?? null
    if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      throw new Error('`daily-date` must be null or a date like 2026-10-08')
    }
    if (date && difficulty === 'easy') throw new Error('a daily challenge must be medium or pro')

    const setup = commandList(data.setup, 'setup')
    const solution = stringList(data.solution, 'solution')
    if (solution.some((c) => c.startsWith('server:'))) throw new Error('`server:` lines are for the setup only')
    if (!solution.length) throw new Error('`solution` needs at least one step')

    if (!Array.isArray(data.goal) || !data.goal.length) throw new Error('`goal` needs at least one check')
    const goal = data.goal.map(parseCheck)

    if (data.origin !== undefined && typeof data.origin !== 'boolean') throw new Error('`origin` must be true or false')
    const start = playAll(createRepo(id, { origin: data.origin === true }), setup, 'setup')
    const target = playAll(start, solution, 'solution')

    // Catch typos: every ref must exist somewhere, and every change must exist in the start.
    const startLabels = new Set(Object.values(start.commits).map((c) => c.label))
    const known = (ref: string) => {
      if (ref.startsWith('tags/')) return [start, target].some((s) => s.tags[ref.slice(5)])
      if (ref.startsWith('heads/')) return [start, target].some((s) => s.branches[ref.slice(6)])
      if (ref.startsWith('origin:')) return [start, target].some((s) => s.origin?.branches[ref.slice(7)])
      if (ref.startsWith('origin/')) return [start, target].some((s) => s.remoteTracking[ref.slice(7)])
      return ref === 'HEAD' || startLabels.has(ref) || [start, target].some((s) => s.branches[ref] || s.tags[ref])
    }
    for (const check of goal) {
      const { refs, changes } = mentions(check)
      for (const ref of refs) if (!known(ref)) throw new Error(`goal mentions unknown ref "${ref}"`)
      for (const c of changes) if (!startLabels.has(c)) throw new Error(`goal mentions unknown change "${c}"`)
    }

    return {
      id,
      order: Number(number),
      daily: date,
      title,
      difficulty,
      concepts: stringList(data.concepts, 'concepts'),
      brief: brief.trim(),
      setup,
      solution,
      goal,
      origin: data.origin === true,
      par: solution.length,
      start,
      target,
    }
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`)
  }
}

export const levelFiles = import.meta.glob('../../levels/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

function loadAll(): Level[] {
  const loaded: Level[] = []
  for (const [path, source] of Object.entries(levelFiles)) {
    try {
      loaded.push(parseLevel(path, source))
    } catch (e) {
      console.error(e) // the level validation tests catch this before it ships
    }
  }
  return loaded
}

/** The player's local date as YYYY-MM-DD. */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * What a player can see on `today`: past dailies join the normal list, today's is the daily challenge,
 * future ones stay hidden. Levels sort by difficulty, then by the number in their id.
 */
export function catalogue(all: Level[], today: string) {
  const listed = all
    .filter((l) => l.daily === null || l.daily < today)
    .sort((a, b) => difficulties.indexOf(a.difficulty) - difficulties.indexOf(b.difficulty) || a.order - b.order)
  return { levels: listed, daily: all.find((l) => l.daily === today) ?? null }
}

const all = loadAll()
const today = catalogue(all, localDate())

/** Levels in the normal list (including past dailies). */
export const levels: Level[] = today.levels
/** Today's daily challenge, if there is one. */
export const dailyToday: Level | null = today.daily

/** How a level is named everywhere in the UI: "E01 · Your first commit". */
export const levelName = (level: Pick<Level, 'id' | 'title'>) => `${level.id} · ${level.title}`

/** No hints on a daily challenge while it's the daily (its ×2 day); afterwards it's a normal level. */
export const hintsAllowed = (level: Level, today = localDate()) => level.daily !== today

/** A playable level by id ("daily" is today's daily). Future dailies aren't playable. */
export function getLevel(id: string): Level | undefined {
  if (id === 'daily') return dailyToday ?? undefined
  return levels.find((l) => l.id === id) ?? (dailyToday?.id === id ? dailyToday : undefined)
}

export function nextLevel(id: string): Level | undefined {
  const i = levels.findIndex((l) => l.id === id)
  return i === -1 ? undefined : levels[i + 1]
}
