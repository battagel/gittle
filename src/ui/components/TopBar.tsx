import { Link } from 'react-router'
import { dailyToday } from '../../levels/load'
import { totalScore } from '../../levels/progress'
import { load } from '../../storage'
import { ScoreBadge } from './ScoreBadge'
import { Wordmark } from './Wordmark'

/** The width the top bar (and footer) always use, so they don't jump between pages. */
export const CHROME_WIDTH = 'mx-auto w-full max-w-7xl px-10'

/** Site header: wordmark, navigation, score, and the (future) sign-in. Same width on every page. */
export function TopBar() {
  return (
    <header className={`${CHROME_WIDTH} flex items-center justify-between py-6`}>
      <Link to="/">
        <Wordmark />
      </Link>
      <nav className="flex items-center gap-7 text-sm font-medium text-muted">
        <Link to="/levels" className="hover:text-ink">
          Levels
        </Link>
        {dailyToday && (
          <Link to="/play/daily" className="hover:text-ink">
            Daily challenge
          </Link>
        )}
        <Link to="/play/sandbox" className="hover:text-ink">
          Sandbox
        </Link>
      </nav>
      <div className="flex items-center gap-3">
        <ScoreBadge score={totalScore(load())} />
        {/* <button
          disabled
          title="Accounts and leaderboards are coming. For now your progress is saved in this browser."
          className="flex cursor-not-allowed items-center gap-2 rounded-full bg-ink/80 px-4 py-1.5 text-sm font-semibold text-paper"
        >
          Sign in
          <span className="rounded-full bg-paper/20 px-1.5 text-[10px] font-bold tracking-wide uppercase">soon</span>
        </button> */}
      </div>
    </header>
  )
}
