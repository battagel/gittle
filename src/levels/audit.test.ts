import { describe, it } from 'vitest'
import { levelFiles, parseLevel } from './load'
import { golfResult } from './score'
import { readable, search } from './search'

// Authoring tool, skipped by default: lists every distinct way to win each level in par strokes or fewer, using any
// command (shortcuts included), so goals can be reviewed for loopholes. Under-par routes should be genuine expert
// shortcuts, never cheats. Run with `npm run levels:audit` (add `-- -t <id>` for one level).
describe.runIf(import.meta.env.GITTLE_AUDIT)('audit: winning routes up to par', () => {
  it.each(Object.entries(levelFiles))('%s', (path, source) => {
    const level = parseLevel(path, source)
    const { routes, depth } = search(level, level.par, 60, 2_000_000)
    const partial = depth < level.par ? ` (searched only up to ${depth} strokes: budget)` : ''
    console.log(`\n${level.id} ${level.title} (par ${level.par}): ${routes.length} winning end states${partial}\n` +
      routes.map((r) => `  ${golfResult(r.length, level.par).padEnd(12)} ${readable(level, r)}`).join('\n'))
  }, 600_000)
})
