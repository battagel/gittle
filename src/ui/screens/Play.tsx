import { useCallback, useRef, useState, type RefObject } from 'react'
import { Link, useParams } from 'react-router'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { getLevel, hintsAllowed, levelName, nextLevel, type Level } from '../../levels/load'
import { afterLevel, formatDay } from '../../levels/progress'
import { layoutStorage, load, update } from '../../storage'
import { SimpleTerminal } from '../../terminal/SimpleTerminal'
import type { TerminalComponent } from '../../terminal/terminal'
import { Brief } from '../components/Brief'
import { DifficultyChip } from '../components/DifficultyChip'
import { GoalList } from '../components/GoalList'
import { ScoreBadge } from '../components/ScoreBadge'
import { GraphPanel } from '../game/GraphPanel'
import { useGame } from '../game/useGame'
import { Tour, type TourStep } from '../game/Tour'
import { WinModal } from '../game/WinModal'

const Terminal: TerminalComponent = SimpleTerminal

const sandboxBrief =
  'Free play. Make some commits and branches, then try merging, rebasing and cherry-picking. Click a commit to copy its sha.'

const pill = 'rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap'

/** Always visible, greyed out until the level is won, so closing the win modal never strands you. */
function NextButton({ level, won }: { level: Level; won: boolean }) {
  const { to, label: text } = afterLevel(level, nextLevel(level.id))
  const label = `${text} →`
  if (!won) {
    return (
      <button disabled title="Solve this level first" className={`${pill} cursor-not-allowed bg-line text-muted`}>
        {label}
      </button>
    )
  }
  return (
    <Link
      to={to}
      className={`${pill} bg-ink text-paper shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      {label}
    </Link>
  )
}

function Handle({ vertical = false }: { vertical?: boolean }) {
  return (
    <Separator className={`group flex items-center justify-center ${vertical ? 'h-3' : 'w-3'}`}>
      <div className={`rounded-full bg-line transition group-hover:bg-muted ${vertical ? 'h-1 w-10' : 'h-10 w-1'}`} />
    </Separator>
  )
}

export function Play() {
  const { levelId = 'sandbox' } = useParams()
  const level = levelId === 'sandbox' ? null : getLevel(levelId)

  if (level === undefined) {
    return (
      <main className="grid h-screen place-items-center text-center">
        <div>
          <p className="text-muted">There's no level called "{levelId}".</p>
          <Link to="/levels" className="mt-4 inline-block font-semibold text-indigo">
            ← Back to levels
          </Link>
        </div>
      </main>
    )
  }
  // key: a fresh game whenever the level changes (e.g. "Next level")
  return <Game key={levelId} level={level} />
}

const tourSteps = (refs: Record<'scenario' | 'graph' | 'terminal' | 'toolbar', RefObject<HTMLElement | null>>): TourStep[] => [
  {
    target: refs.scenario,
    title: 'The scenario',
    text: 'Every level starts with a short story and a goal. The checklist underneath ticks itself off as you go.',
  },
  {
    target: refs.graph,
    title: 'Your repository',
    text: 'Circles are commits, with their sha inside. Coloured lines are branches, and the labels show where each branch and `HEAD` point. Faded commits are ones nothing points at any more. Click a commit to copy its sha.',
  },
  {
    target: refs.terminal,
    title: 'The terminal',
    text: 'Type real git commands here, exactly as you would in a terminal. `help` lists everything gittle understands.',
  },
  {
    target: refs.toolbar,
    title: 'Strokes and par',
    text: 'Par is how many commands the straightforward solution takes. Only commands that change the repo count as strokes, so looking around is free. Stuck? **Hint** plays the next step for you, and **Retry** starts again.',
  },
]

function Game({ level }: { level: Level | null }) {
  const game = useGame(level)
  const refs = {
    scenario: useRef<HTMLElement>(null),
    graph: useRef<HTMLDivElement>(null),
    terminal: useRef<HTMLElement>(null),
    toolbar: useRef<HTMLDivElement>(null),
  }
  const [touring, setTouring] = useState(() => !load().settings.toured)
  const endTour = useCallback(() => {
    setTouring(false)
    update((d) => void (d.settings.toured = true))
  }, [])
  const columns = useDefaultLayout({ id: 'play-columns', storage: layoutStorage })
  const left = useDefaultLayout({ id: 'play-left', storage: layoutStorage })
  const canHint = level !== null && hintsAllowed(level)
  const hintLabel = !canHint
    ? 'No hints on the daily'
    : level && game.hintsUsed > 0
      ? `Hint · ${game.hintsUsed}/${level.solution.length} steps`
      : 'Hint'

  return (
    <div className="flex h-screen flex-col">
      <header className="grid grid-cols-3 items-center border-b border-line bg-surface px-5 py-3">
        <Link to="/levels" className="text-sm text-muted hover:text-ink">
          ← Levels
        </Link>
        <span className="text-center font-semibold">{level ? levelName(level) : 'Sandbox'}</span>
        <span className="flex justify-end">
          <ScoreBadge score={game.score} />
        </span>
      </header>

      <Group orientation="horizontal" id="play-columns" className="flex-1 p-3" {...columns}>
        <Panel id="left" defaultSize="38" minSize={300}>
          <Group orientation="vertical" id="play-left" {...left}>
            <Panel id="scenario" defaultSize="34" minSize={100}>
              <section ref={refs.scenario} className="h-full overflow-y-auto rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between">
                  {level ? (
                    <span className="flex items-center gap-3">
                      <DifficultyChip difficulty={level.difficulty} />
                      {level.daily && (
                        <span className="text-xs font-semibold tracking-wide text-amber uppercase">
                          Daily · {formatDay(level.daily)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold tracking-wide text-muted uppercase">Sandbox</span>
                  )}
                </div>
                <div className="mt-3">
                  <Brief text={level?.brief ?? sandboxBrief} />
                </div>
                {level && (
                  <div className="mt-4 border-t border-line pt-4">
                    <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Goal</div>
                    <GoalList level={level} repo={game.repo} />
                  </div>
                )}
              </section>
            </Panel>
            <Handle vertical />
            <Panel id="terminal" minSize={170}>
              <div className="flex h-full flex-col gap-3">
                <div ref={refs.toolbar} className="flex flex-wrap items-center gap-2 px-1 py-1">
                  <button
                    onClick={game.reset}
                    className="flex items-center gap-2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold shadow-sm ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="text-lg leading-none text-indigo">↺</span>
                    Retry
                  </button>
                  {level && (
                    <button
                      onClick={game.hint}
                      disabled={!canHint || game.replaying || game.won}
                      title={
                        canHint
                          ? "Types the next step of the solution (resets first if you've changed things)"
                          : 'Daily challenges are hint-free on their day'
                      }
                      className="flex items-center gap-2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold shadow-sm ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-50 disabled:shadow-sm"
                    >
                      <span className="text-lg leading-none text-amber">✦</span>
                      {hintLabel}
                    </button>
                  )}
                  <span className="ml-auto px-2 text-sm whitespace-nowrap text-muted">
                    {level && (
                      <>
                        Par <span className="font-semibold text-ink">{level.par}</span>
                        <span className="mx-2">·</span>
                      </>
                    )}
                    Strokes <span className="font-semibold text-ink tabular-nums">{game.strokes}</span>
                  </span>
                  {level && <NextButton level={level} won={game.won} />}
                </div>
                <section ref={refs.terminal} className="min-h-0 flex-1 rounded-2xl border border-line bg-surface">
                  <Terminal
                    lines={game.lines}
                    prompt={game.prompt}
                    onSubmit={game.submit}
                    typing={game.typing}
                    disabled={game.won}
                  />
                </section>
              </div>
            </Panel>
          </Group>
        </Panel>
        <Handle />
        <Panel id="graph" minSize={320}>
          <div ref={refs.graph} className="h-full">
            <GraphPanel repo={game.repo} effects={game.effects} resets={game.resets} />
          </div>
        </Panel>
      </Group>

      {touring && <Tour steps={tourSteps(refs)} onDone={endTour} />}
      {level && game.win && (
        <WinModal level={level} win={game.win} next={nextLevel(level.id)} onRetry={game.reset} onClose={game.closeWin} />
      )}
    </div>
  )
}
