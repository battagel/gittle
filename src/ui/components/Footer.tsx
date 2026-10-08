import { Link } from 'react-router'
import { dailyToday } from '../../levels/load'
import { Wordmark } from './Wordmark'

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line py-12 text-sm text-muted">
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-10">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs">Learn git by seeing it. Real commands, a live commit graph, and golf scoring.</p>
        </div>
        <div>
          <div className="mb-3 font-semibold text-ink">Play</div>
          <ul className="space-y-2">
            <li>
              <Link to="/levels" className="hover:text-ink">
                All levels
              </Link>
            </li>
            {dailyToday && (
              <li>
                <Link to="/play/daily" className="hover:text-ink">
                  Today's daily challenge
                </Link>
              </li>
            )}
            <li>
              <Link to="/play/sandbox" className="hover:text-ink">
                Sandbox
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="mb-3 font-semibold text-ink">About</div>
          <ul className="space-y-2">
            <li>Simple and Visual</li>
            <li>No account needed</li>
            <li>Git-like CLI</li>
          </ul>
        </div>
      </div>
      <div className="mt-10 text-xs">© {new Date().getFullYear()} Matthew Battagel · MIT licence</div>
    </footer>
  )
}
