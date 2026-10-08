import { useCallback, useEffect, useRef, useState } from 'react'
import { createRepo, run, type Effect, type RepoState } from '../../engine'
import { isSolved } from '../../levels/goal'
import { planHint } from '../../levels/hints'
import { hintsAllowed, localDate, type Level } from '../../levels/load'
import { totalScore } from '../../levels/progress'
import { DAILY_BONUS, points } from '../../levels/score'
import { load, update } from '../../storage'
import type { TermLine } from '../../terminal/terminal'

interface GameState {
  repo: RepoState
  effects: Effect[]
  lines: TermLine[]
  strokes: number
  moves: string[] // the commands that cost a stroke, in order (shown after a win)
  resets: number // bumps on reset so the graph redraws instantly instead of animating
  won: boolean
}

export interface WinInfo {
  strokes: number
  previousBest: number | null
  points: number // earned by this run, including any daily bonus
  bonus: boolean // a daily solved on its own day
  moves: string[]
}

const welcome: TermLine[] = [{ kind: 'hint', text: 'Type git commands here. `help` lists what gittle understands.' }]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function promptFor(repo: RepoState): string {
  return repo.head.type === 'branch' ? `(${repo.head.name}) $` : `(${repo.head.sha}) $`
}

/** One play-through of a level (or the sandbox when `level` is null). Remount (key) to switch levels. */
export function useGame(level: Level | null) {
  const fresh = useCallback(
    (resets: number): GameState => ({
      repo: level?.start ?? createRepo('sandbox'),
      effects: [],
      lines: welcome,
      strokes: 0,
      moves: [],
      resets,
      won: false,
    }),
    [level],
  )

  const [game, setGame] = useState(() => fresh(0))
  const [typing, setTyping] = useState<string | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [win, setWin] = useState<WinInfo | null>(null)
  const [score, setScore] = useState(() => totalScore(load()))
  const replay = useRef(0) // bump to cancel a running hint replay

  useEffect(() => () => void replay.current++, [])

  // The engine is pure, so running it inside the updater is safe (StrictMode may call it twice).
  const submit = useCallback(
    (input: string) => {
      setGame((g) => {
        if (g.won) return g
        const echo: TermLine = { kind: 'input', prompt: promptFor(g.repo), text: input }
        if (input.trim() === 'clear') return { ...g, lines: [] }
        const r = run(g.repo, input)
        const lines = [...g.lines, echo, ...r.output]
        const won = level !== null && isSolved(level, r.state)
        // free, but may update bookkeeping (`git switch -`) or finish a goal (the bisect mark that names the culprit)
        if (!r.changed) return { ...g, repo: r.state, lines, won }
        return { ...g, repo: r.state, effects: r.effects, lines, strokes: g.strokes + 1, moves: [...g.moves, input.trim()], won }
      })
    },
    [level],
  )

  // Record the result once per play-through (StrictMode runs effects twice in dev), then show the win, also once:
  // after the player closes the modal, nothing may bring it back until they play again.
  const recorded = useRef<{ resets: number; info: WinInfo; shown: boolean } | null>(null)
  useEffect(() => {
    if (!game.won || !level) return
    if (recorded.current?.resets !== game.resets) {
      const before = load().progress[level.key]
      const bonus = level.daily === localDate()
      update((d) => {
        d.progress[level.key] = {
          best: Math.min(game.strokes, before?.best ?? Infinity),
          dayBest: bonus ? Math.min(game.strokes, before?.dayBest ?? Infinity) : before?.dayBest,
          completedAt: new Date().toISOString(),
        }
      })
      setScore(totalScore(load()))
      const earned = points(game.strokes, level.par) * (bonus ? DAILY_BONUS : 1)
      recorded.current = {
        resets: game.resets,
        info: { strokes: game.strokes, previousBest: before?.best ?? null, points: earned, bonus, moves: game.moves },
        shown: false,
      }
    }
    const current = recorded.current
    if (current.shown) return
    const t = setTimeout(() => {
      current.shown = true
      setWin(current.info)
    }, 700) // let the last animation land
    return () => clearTimeout(t)
  }, [game.won, game.strokes, game.resets, game.moves, level])

  const reset = useCallback(() => {
    replay.current++
    setTyping(null)
    setWin(null)
    setGame((g) => fresh(g.resets + 1))
  }, [fresh])

  /** Type the next solution step; if the player has changed things, reset and replay one step further first. */
  const hint = useCallback(async () => {
    if (!level || game.won || !hintsAllowed(level)) return
    const plan = planHint(level, game.repo, hintsUsed)
    setHintsUsed(plan.hintsUsed)
    if (plan.reset) reset()
    else replay.current++ // cancel anything still typing
    const token = replay.current
    await sleep(plan.reset ? 400 : 100)
    for (const cmd of plan.commands) {
      for (let i = 1; i <= cmd.length; i++) {
        if (replay.current !== token) return
        setTyping(cmd.slice(0, i))
        await sleep(30)
      }
      await sleep(250)
      if (replay.current !== token) return
      setTyping(null)
      submit(cmd)
      await sleep(650)
    }
  }, [level, game.repo, game.won, hintsUsed, reset, submit])

  /** Hide the win modal (e.g. to look at the graph); the level stays won. */
  const closeWin = useCallback(() => setWin(null), [])

  return {
    ...game,
    prompt: promptFor(game.repo),
    typing,
    replaying: typing !== null,
    hintsUsed,
    win,
    score,
    submit,
    reset,
    hint,
    closeWin,
  }
}
