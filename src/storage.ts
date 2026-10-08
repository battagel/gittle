// Everything gittle remembers lives under one versioned localStorage key (docs/architecture.md#storage).
// Every access is guarded: the game must work when storage is blocked, just without saving.

const KEY = 'gittle:v1'

export interface Progress {
  best: number // fewest strokes ever
  dayBest?: number // fewest strokes on a daily challenge's own day (earns the bonus)
  completedAt: string
}

export interface SaveData {
  version: 1
  progress: Record<string, Progress>
  settings: {
    difficulties?: ('easy' | 'medium' | 'pro')[] // level-select filter; empty = all
    concepts?: string[] // level-select filter; empty = all
    layouts?: Record<string, string> // react-resizable-panels layouts by group id
    toured?: boolean // has seen the first-run tour of the play screen
  }
}

const empty = (): SaveData => ({ version: 1, progress: {}, settings: {} })

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? (JSON.parse(raw) as SaveData) : null
    return data?.version === 1 ? data : empty()
  } catch {
    return empty()
  }
}

export function update(fn: (data: SaveData) => void) {
  try {
    const data = load()
    fn(data)
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // storage unavailable: carry on without saving
  }
}

/** Forget everything: progress, scores and settings. */
export function resetAll() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing saved, nothing to forget
  }
}

/** Adapter so react-resizable-panels saves panel sizes inside our key. */
export const layoutStorage = {
  getItem: (name: string) => load().settings.layouts?.[name] ?? null,
  setItem: (name: string, value: string) =>
    update((d) => {
      d.settings.layouts = { ...d.settings.layouts, [name]: value }
    }),
}
