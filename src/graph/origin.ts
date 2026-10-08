import { ancestors } from '../engine/graph'
import type { RepoState } from '../engine'

/** What's on origin that you haven't fetched: new commits per branch, and new branches. For the strip above the graph. */
export function unseenOnOrigin(state: RepoState): { branch: string; commits: number; isNew: boolean }[] {
  if (!state.origin) return []
  return Object.entries(state.origin.branches)
    .map(([branch, sha]) => ({
      branch,
      commits: [...ancestors(state, sha)].filter((c) => !state.commits[c].local).length,
      isNew: state.remoteTracking[branch] === undefined,
    }))
    .filter((u) => u.commits > 0 || u.isNew)
}
