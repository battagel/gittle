export type Sha = string // 7 hex chars, e.g. "a1b2c3d"

export interface Commit {
  sha: Sha
  label: string // "C4", "C4'" — display and level authoring only
  parents: Sha[] // 0 (root), 1, or 2 (merge)
  // The diff this commit carries, as space-separated parts: "C4"; "-C4" for a revert; "-C2 -C3" for a reverted merge.
  // Merge commits carry no change of their own: "".
  change: string
  message: string // from `-m`, or the label by default; copies keep the original's message
  seq: number // creation order; parents always have a lower seq than children
  local: boolean // false for commits teammates pushed that you haven't fetched yet
}

/** The server: its own branches and tags. Commits live in the shared pool (see Commit.local). */
export interface Origin {
  branches: Record<string, Sha>
  tags: Record<string, Sha>
  pullRequests: number // numbering for "Merge pull request #n" in the setup
  protected: string[] // branches that reject force-pushes and deletion (server: protect <b>)
}

export interface ReflogEntry {
  sha: Sha
  message: string // git's wording: "commit: Add search", "reset: moving to HEAD~2", "checkout: moving from main to feature"
}

export interface Bisect {
  original: Head // where to go back to on `git bisect reset`
  bad: Sha | null
  good: Sha[]
  skipped: Sha[]
}

export type Head = { type: 'branch'; name: string } | { type: 'detached'; sha: Sha }

export interface RepoState {
  commits: Record<Sha, Commit>
  branches: Record<string, Sha>
  tags: Record<string, Sha>
  head: Head
  previous: Head | null // where the last switch/checkout came from: `git switch -` and @{-1}
  origin: Origin | null // the remote, if this level has one
  remoteTracking: Record<string, Sha> // your last known view of origin: "main" -> where origin/main points
  upstream: Record<string, string> // local branch -> the origin branch it tracks
  annotated: Record<string, string> // tags made with -a/-m: name -> message (git describe only uses these by default)
  reflogs: Record<string, ReflogEntry[]> // "HEAD" and each branch: where it has pointed, oldest first
  bisect: Bisect | null // a bisect in progress
  bisected: Sha | null // what the last bisect found ("<sha> is the first bad commit")
  bug: string | null // the change that breaks `npm test` (levels about bisect), e.g. "C7"
  nextNumber: number // next "C<n>" label
  seed: string // per level, so shas are deterministic
}

export type OutputKind = 'info' | 'error' | 'hint'

export interface OutputLine {
  kind: OutputKind
  text: string
}

export type Effect =
  | { type: 'commit'; sha: Sha }
  | { type: 'merge'; sha: Sha }
  | { type: 'copy'; from: Sha; to: Sha } // cherry-pick / rebase
  | { type: 'revert'; of: Sha; sha: Sha }
  | { type: 'move-ref'; kind: 'branch' | 'tag' | 'remote'; name: string; from: Sha | null; to: Sha | null }
  | { type: 'move-head'; from: Head; to: Head }

export interface RunResult {
  state: RepoState // the input state, untouched, on error or no-op
  output: OutputLine[]
  changed: boolean // true if the repo differs structurally: this is a stroke
  effects: Effect[]
}

export interface RunOptions {
  /** Resolve commit labels ("C4", "C4'") as refs. For level setup/solutions and tests, never for players. */
  labels?: boolean
}
