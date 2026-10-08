import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { dailyToday, difficulties, levelName, levels, type Difficulty, type Level } from '../../levels/load'
import { formatDay, levelPoints } from '../../levels/progress'
import { DAILY_BONUS, golfResult } from '../../levels/score'
import { load, update, type Progress, type SaveData } from '../../storage'
import { DifficultyChip } from '../components/DifficultyChip'
import { Footer } from '../components/Footer'
import { TopBar } from '../components/TopBar'

const chipColour: Record<Difficulty, string> = {
  easy: 'bg-mint',
  medium: 'bg-amber',
  pro: 'bg-coral',
}

const headings: Record<Difficulty, string> = {
  easy: 'Easy: the basics',
  medium: 'Medium: moving work around',
  pro: 'Pro: real-world messes',
}

const card = 'rounded-2xl bg-surface p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
const chip = 'rounded-full px-4 py-1.5 text-sm font-medium transition'
const allConcepts = [...new Set(levels.flatMap((l) => l.concepts))].sort((a, b) => a.localeCompare(b))

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

export function LevelSelect() {
  const [save] = useState<SaveData>(load)
  const [chosen, setChosen] = useState<Difficulty[]>(save.settings.difficulties ?? [])
  const [concepts, setConcepts] = useState<string[]>(save.settings.concepts ?? [])

  const chooseDifficulties = (next: Difficulty[]) => {
    setChosen(next)
    update((d) => void (d.settings.difficulties = next))
  }
  const chooseConcepts = (next: string[]) => {
    setConcepts(next)
    update((d) => void (d.settings.concepts = next))
  }

  const progress = (l: Level) => save.progress[l.id]
  const best = (l: Level) => progress(l)?.best
  const visible = (l: Level) =>
    (chosen.length === 0 || chosen.includes(l.difficulty)) &&
    (concepts.length === 0 || l.concepts.some((c) => concepts.includes(c)))
  const shown = levels.filter(visible)
  const nextUp = shown.find((l) => best(l) === undefined)
  const solved = levels.filter((l) => best(l) !== undefined).length

  return (
    <div className="mx-auto max-w-5xl px-6">
      <TopBar />
      <main className="pt-4">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Levels</h1>
        <span className="text-sm text-muted">
          {solved} / {levels.length} solved
        </span>
      </div>
      {solved === 0 && (
        <p className="mb-6 rounded-2xl bg-indigo/10 px-5 py-4 text-sm">
          <span className="font-semibold">New to git?</span> Start with <span className="font-semibold">Your first commit</span>{' '}
          (E01, highlighted below). The Easy levels follow your first week on a team, one step at a time.
        </p>
      )}

      <section className="mb-12 grid grid-cols-3 gap-4">
        <DailyCard progress={dailyToday ? progress(dailyToday) : undefined} />
        <Link to="/play/sandbox" className={`${card} ring-1 ring-line`}>
          <div className="text-xs font-semibold tracking-wide text-muted uppercase">Free play</div>
          <div className="mt-2 text-lg font-semibold">Sandbox</div>
          <p className="mt-1 text-sm text-muted">No goal. Try any command and watch the graph.</p>
        </Link>
      </section>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => chooseDifficulties([])}
            className={`${chip} ${chosen.length === 0 ? 'bg-ink text-white' : 'bg-surface text-muted hover:text-ink'}`}
          >
            All
          </button>
          {difficulties.map((d) => (
            <button
              key={d}
              onClick={() => chooseDifficulties(toggle(chosen, d))}
              className={`${chip} capitalize ${chosen.includes(d) ? `${chipColour[d]} text-white` : 'bg-surface text-muted hover:text-ink'}`}
            >
              {d}
            </button>
          ))}
        </div>
        <CommandFilter selected={concepts} onChange={chooseConcepts} />
      </div>

      {difficulties.map((difficulty) => {
        const group = shown.filter((l) => l.difficulty === difficulty)
        if (!group.length) return null
        const all = levels.filter((l) => l.difficulty === difficulty)
        return (
          <section key={difficulty} className="mb-10">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{headings[difficulty]}</h2>
              <span className="text-sm text-muted">
                {all.filter((l) => best(l) !== undefined).length} / {all.length} solved
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {group.map((level) => (
                <LevelCard key={level.id} level={level} progress={progress(level)} nextUp={level === nextUp} />
              ))}
            </div>
          </section>
        )
      })}
      {!shown.length && <p className="py-10 text-center text-muted">No levels match these filters.</p>}
      </main>
      <Footer />
    </div>
  )
}

function Result({ level, progress }: { level: Level; progress: Progress | undefined }) {
  return progress ? (
    <span className="rounded-full bg-paper px-2.5 py-0.5 font-semibold ring-1 ring-line">
      {golfResult(progress.best, level.par)} · {levelPoints(level, progress)}
    </span>
  ) : (
    <span className="text-muted">Not played</span>
  )
}

function DailyCard({ progress }: { progress: Progress | undefined }) {
  const level = dailyToday
  if (!level) {
    return (
      <div className="col-span-2 grid place-items-center rounded-2xl border-2 border-dashed border-line p-6 text-center text-muted">
        <div>
          <div className="font-semibold text-ink">No daily challenge today</div>
          <div className="mt-1 text-sm">Past dailies live in the list below.</div>
        </div>
      </div>
    )
  }
  return (
    <Link to="/play/daily" className={`${card} col-span-2 flex flex-col ring-2 ring-amber`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-amber uppercase">
          Daily challenge · {formatDay(level.daily!)}
        </span>
        <span className="flex items-center gap-3">
          <span className="rounded-full bg-amber px-2 py-0.5 text-xs font-bold text-white">{DAILY_BONUS}x</span>
          <DifficultyChip difficulty={level.difficulty} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold">{levelName(level)}</div>
      <div className="mt-1 flex flex-wrap gap-x-2">
        {level.concepts.map((c) => (
          <span key={c} className="font-mono text-[11px] text-muted">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-5 text-sm">
        <span className="text-muted">Par {level.par}</span>
        <Result level={level} progress={progress} />
      </div>
    </Link>
  )
}

function LevelCard({ level, progress, nextUp }: { level: Level; progress: Progress | undefined; nextUp: boolean }) {
  return (
    <Link to={`/play/${level.id}`} className={`${card} flex flex-col ${nextUp ? 'ring-2 ring-indigo' : 'ring-1 ring-line'}`}>
      <div className="flex items-center justify-between">
        <DifficultyChip difficulty={level.difficulty} />
        {nextUp ? (
          <span className="text-xs font-semibold text-indigo">Next up</span>
        ) : (
          level.daily && <span className="text-xs font-semibold text-amber">Daily · {formatDay(level.daily)}</span>
        )}
      </div>
      <div className="mt-2 text-lg font-semibold">{levelName(level)}</div>
      <div className="mt-1 flex flex-wrap gap-x-2">
        {level.concepts.map((c) => (
          <span key={c} className="font-mono text-[11px] text-muted">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-5 text-sm">
        <span className="text-muted">Par {level.par}</span>
        <Result level={level} progress={progress} />
      </div>
    </Link>
  )
}

/** A "Commands" button that opens a checklist of the commands/concepts levels are tagged with. */
function CommandFilter({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`${chip} flex items-center gap-2 ${selected.length ? 'bg-ink text-white' : 'bg-surface text-muted hover:text-ink'}`}
      >
        Commands
        {selected.length > 0 && (
          <span className="rounded-full bg-paper/20 px-1.5 text-xs font-bold tabular-nums">{selected.length}</span>
        )}
        <span className={`text-xs transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-64 rounded-2xl bg-surface p-2 shadow-xl ring-1 ring-line">
          <div className="flex items-center justify-between px-2 py-1.5 text-xs text-muted">
            <span>Show levels that use…</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="font-semibold text-ink hover:underline">
                Clear
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {allConcepts.map((c) => (
              <li key={c}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-paper">
                  <input
                    type="checkbox"
                    checked={selected.includes(c)}
                    onChange={() => onChange(toggle(selected, c))}
                    className="size-4 accent-indigo"
                  />
                  <span className="font-mono text-[13px]">{c}</span>
                  <span className="ml-auto text-xs text-muted">{levels.filter((l) => l.concepts.includes(c)).length}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
