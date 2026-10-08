import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import { dailyToday, difficulties, getLevel, levelName, levels, type Difficulty } from '../../levels/load'
import { formatDay, levelPoints } from '../../levels/progress'
import { DAILY_BONUS, golfResult } from '../../levels/score'
import { load, type Progress } from '../../storage'
import { DifficultyChip } from '../components/DifficultyChip'
import { Footer } from '../components/Footer'
import { TopBar } from '../components/TopBar'
import { Wordmark } from '../components/Wordmark'

const LandingDemo = lazy(() => import('../components/LandingDemo'))

const steps = [
  { n: 1, title: 'Read the scenario', text: 'A short story: a fix on the wrong branch, a merge that went out too early, a lost commit.' },
  { n: 2, title: 'Type real git', text: 'commit, branch, switch, merge, rebase, cherry-pick, reset, revert, tag… exactly as in a terminal.' },
  { n: 3, title: 'Watch the graph', text: 'Every command animates the commit graph, so you see what git actually did.' },
  { n: 4, title: 'Score like golf', text: 'Solve it in as few commands as you can. Hit par, or go under it for a birdie.' },
]

const ideas = [
  { term: 'A commit is a change', text: 'Not a snapshot of files: a diff, with a pointer to its parent. Rebase and cherry-pick copy changes into new commits.' },
  { term: 'A branch is a label', text: 'Just a name pointing at a commit. Creating, moving and deleting branches is cheap and safe.' },
  { term: 'HEAD is where you are', text: 'New commits go wherever HEAD points. Most "where did my work go?" moments are about HEAD.' },
]

const tiers: Record<Difficulty, { title: string; text: string }> = {
  easy: { title: 'New to git', text: 'Your first week on the team: commits, branches, HEAD, switching, fast-forwards and tags.' },
  medium: { title: 'Moving work around', text: 'Merges, rebases, cherry-picks, resets and reverts, and when to use which.' },
  pro: { title: 'Real-world messes', text: 'Reverted merges, wrong bases, leaked secrets, backports and broken releases.' },
}

export function Landing() {
  const progress = load().progress
  const isNew = Object.keys(progress).length === 0
  const next = levels.find((l) => !progress[l.key])
  const first = getLevel('E01')

  return (
    <div className="mx-auto max-w-6xl px-10">
      <TopBar />

      <main>
        <section className="grid min-h-[620px] grid-cols-[1fr_1.1fr] items-center gap-16">
          <div>
            <Wordmark size="text-7xl" />
            <p className="mt-6 max-w-md text-xl leading-relaxed text-muted">
              Learn git by <span className="font-semibold text-ink">seeing</span> it. Solve little repo puzzles in as few
              commands as you can.
            </p>
            {isNew && first ? (
              <div className="mt-10">
                <div className="flex items-center gap-3">
                  <Link
                    to={`/play/${first.id}`}
                    className="rounded-full bg-ink px-8 py-4 text-lg font-semibold text-paper shadow-lg shadow-ink/10 transition hover:-translate-y-0.5 hover:shadow-xl"
                  >
                    Start learning →
                  </Link>
                  <Link to="/levels" className="rounded-full px-6 py-4 font-semibold ring-1 ring-line hover:bg-surface">
                    Browse levels
                  </Link>
                </div>
                <p className="mt-4 text-sm text-muted">
                  New to git? Begin with <span className="font-semibold text-ink">{levelName(first)}</span>: the Easy levels
                  follow your first week on a team.
                </p>
              </div>
            ) : (
              <div className="mt-10 flex items-center gap-3">
                <Link
                  to={next ? `/play/${next.id}` : '/levels'}
                  className="rounded-full bg-ink px-8 py-4 text-lg font-semibold text-paper shadow-lg shadow-ink/10 transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  {next ? `Continue: ${levelName(next)} →` : 'All levels →'}
                </Link>
                <Link to="/levels" className="rounded-full px-6 py-4 font-semibold ring-1 ring-line hover:bg-surface">
                  All levels
                </Link>
              </div>
            )}
          </div>
          <div className="h-[520px]">
            <Suspense fallback={<div className="h-full rounded-3xl bg-surface ring-1 ring-line" />}>
              <LandingDemo />
            </Suspense>
          </div>
        </section>

        <DailySection progress={progress} />

        <section className="mt-24">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <div className="mt-8 grid grid-cols-4 gap-4">
            {steps.map((s) => (
              <div key={s.n} className="rounded-2xl bg-surface p-6 ring-1 ring-line">
                <div className="grid size-8 place-items-center rounded-full bg-indigo font-bold text-white">{s.n}</div>
                <div className="mt-4 font-semibold">{s.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-24 grid grid-cols-[1fr_1.4fr] gap-16">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Files don't matter</h2>
            <p className="mt-4 leading-relaxed text-muted">
              git is confusing when you think about files. It clicks when you see the graph. gittle never shows a file:
              just commits, branches and HEAD, so the model underneath finally makes sense.
            </p>
          </div>
          <dl className="space-y-5">
            {ideas.map((i, k) => (
              <div key={i.term} className="flex gap-4">
                <span className={`mt-1.5 size-3 shrink-0 rounded-full ${['bg-indigo', 'bg-coral', 'bg-mint'][k]}`} />
                <div>
                  <dt className="font-semibold">{i.term}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted">{i.text}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-24">
          <h2 className="text-3xl font-bold tracking-tight">Pick your level</h2>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {difficulties.map((d) => {
              const group = levels.filter((l) => l.difficulty === d)
              const start = group.find((l) => !progress[l.key]) ?? group[0]
              const solved = group.filter((l) => progress[l.key]).length
              return (
                <Link
                  key={d}
                  to={start ? `/play/${start.id}` : '/levels'}
                  className="flex flex-col rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <DifficultyChip difficulty={d} />
                    {d === 'easy' && isNew && <span className="text-xs font-semibold text-indigo">Start here</span>}
                  </div>
                  <div className="mt-3 text-lg font-semibold">{tiers[d].title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{tiers[d].text}</p>
                  <div className="mt-auto flex justify-between pt-5 text-sm text-muted">
                    <span>
                      {solved} / {group.length} solved
                    </span>
                    <span className="font-semibold text-ink">{start ? `${levelName(start)} →` : ''}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

/** Today's daily, with the last few as smaller cards beside it. Widths follow the golden ratio (φ : 1). */
function DailySection({ progress }: { progress: Record<string, Progress> }) {
  const previous = levels
    .filter((l) => l.daily)
    .sort((a, b) => b.daily!.localeCompare(a.daily!))
    .slice(0, 3)
  if (!dailyToday && !previous.length) return null

  return (
    <section className="mt-6 grid grid-cols-[1.618fr_1fr] gap-4">
      {dailyToday ? (
        <Link
          to="/play/daily"
          className="flex flex-col justify-between rounded-3xl bg-surface p-7 shadow-sm ring-2 ring-amber transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-amber uppercase">
                Daily challenge · {formatDay(dailyToday.daily!)}
              </span>
              <DifficultyChip difficulty={dailyToday.difficulty} />
            </div>
            <div className="mt-2 text-3xl font-bold tracking-tight">{levelName(dailyToday)}</div>
            <div className="mt-2 text-sm text-muted">
              A new puzzle every day, worth {DAILY_BONUS}x points on the day. No hints!
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm text-muted">Par {dailyToday.par}</span>
            {progress[dailyToday.key] ? (
              <span className="rounded-full bg-paper px-3 py-1 text-sm font-semibold ring-1 ring-line">
                {golfResult(progress[dailyToday.key].best, dailyToday.par)} · {levelPoints(dailyToday, progress[dailyToday.key])}
              </span>
            ) : (
              <span className="rounded-full bg-amber px-5 py-2.5 font-semibold text-white">Play today's →</span>
            )}
          </div>
        </Link>
      ) : (
        <div className="grid place-items-center rounded-3xl border-2 border-dashed border-line p-7 text-center text-muted">
          No daily challenge today. Try one from the last few days.
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="text-xs font-semibold tracking-wide text-muted uppercase">Previous days</div>
        {previous.map((l) => (
          <Link
            key={l.id}
            to={`/play/${l.id}`}
            className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <div className="min-w-0">
              <div className="text-xs text-muted">{formatDay(l.daily!)}</div>
              <div className="truncate font-semibold">{levelName(l)}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <DifficultyChip difficulty={l.difficulty} />
              <span className="text-xs text-muted">
                {progress[l.key] ? `${golfResult(progress[l.key].best, l.par)} · ${levelPoints(l, progress[l.key])}` : 'Not played'}
              </span>
            </div>
          </Link>
        ))}
        {!previous.length && <p className="text-sm text-muted">Past dailies will collect here.</p>}
      </div>
    </section>
  )
}
