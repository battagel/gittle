import { ancestors } from '../engine/graph'
import type { RepoState, Sha } from '../engine'
import { branchPalette, colours } from '../theme'

// VS Code-style layout: root at the bottom, one commit per row (by creation order), one lane per branch.
// Labels and ref pills sit in a column to the right of all lanes.

export const COL = 64 // lane spacing
export const ROW = 72 // row spacing
export const DIAMETER = 54
export const PILL_H = 22

export interface LaidCommit {
  sha: Sha
  label: string
  x: number
  y: number
  colour: string
  reachable: boolean
  head: boolean
  revert: boolean
  firstParent: Sha | null
}

export interface LaidEdge {
  id: string
  // The horizontal leg of a fork/merge is drawn on the source's row: a fork leaves its parent sideways,
  // a merge enters the merge commit sideways (like VS Code). Straight edges go child -> parent.
  source: Sha
  target: Sha
  colour: string
  kind: 'straight' | 'fork' | 'merge'
  reachable: boolean
}

export interface LaidLabel {
  id: string
  text: string
  x: number // left edge
  y: number
  reachable: boolean
}

export interface LaidPill {
  id: string
  kind: 'head' | 'branch' | 'tag' | 'remote'
  text: string
  x: number // centre
  y: number
  width: number
  colour: string
}

export interface GraphLayout {
  commits: LaidCommit[]
  edges: LaidEdge[]
  labels: LaidLabel[]
  pills: LaidPill[]
  bounds: { x1: number; y1: number; x2: number; y2: number }
}

const textWidth = (text: string, px: number) => text.length * px * 0.62

export function layout(state: RepoState): GraphLayout {
  // only what you have: commits teammates pushed stay invisible until you fetch them
  const commits = Object.values(state.commits)
    .filter((c) => c.local)
    .sort((a, b) => a.seq - b.seq)
  const branchNames = Object.keys(state.branches).sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : 0))
  const branchColour = new Map(branchNames.map((name, i) => [name, branchPalette[i % branchPalette.length]]))
  const headSha = state.head.type === 'branch' ? state.branches[state.head.name] : state.head.sha

  // Lanes: each branch claims its unclaimed first-parent chain; anything left over gets a neutral lane.
  const laneOf = new Map<Sha, number>()
  const laneColour: string[] = []
  const claim = (tip: Sha, colour: string) => {
    const lane = laneColour.length
    let claimed = false
    for (let s: Sha | undefined = tip; s && !laneOf.has(s); s = state.commits[s].parents[0]) {
      laneOf.set(s, lane)
      claimed = true
    }
    if (claimed) laneColour.push(colour)
  }
  for (const name of branchNames) claim(state.branches[name], branchColour.get(name)!)
  // origin/<b> shares its branch's colour; remote-only branches get the next colours
  let extra = branchNames.length
  const remoteColour = (name: string) => branchColour.get(name) ?? branchPalette[extra++ % branchPalette.length]
  const remoteColours = new Map(Object.keys(state.remoteTracking).sort().map((n) => [n, remoteColour(n)]))
  for (const [name, sha] of Object.entries(state.remoteTracking)) claim(sha, remoteColours.get(name)!)
  for (const c of [...commits].reverse()) claim(c.sha, colours.neutral)

  const reachable = new Set<Sha>()
  for (const tip of [headSha, ...Object.values(state.branches), ...Object.values(state.tags), ...Object.values(state.remoteTracking)]) {
    for (const s of ancestors(state, tip)) reachable.add(s)
  }

  const colourOf = (sha: Sha) => laneColour[laneOf.get(sha)!]
  const rowY = (i: number) => -i * ROW

  const laid: LaidCommit[] = commits.map((c, i) => ({
    sha: c.sha,
    label: c.label,
    x: laneOf.get(c.sha)! * COL,
    y: rowY(i),
    colour: colourOf(c.sha),
    reachable: reachable.has(c.sha),
    head: c.sha === headSha,
    revert: c.change.startsWith('-'),
    firstParent: c.parents[0] ?? null,
  }))

  const edges: LaidEdge[] = commits.flatMap((c) =>
    c.parents.map((p, i) => {
      const kind = laneOf.get(c.sha) === laneOf.get(p) ? 'straight' : i === 0 ? 'fork' : 'merge'
      return {
        id: `${c.sha}>${p}:${kind}`, // kind in the id: a shape change swaps the edge rather than re-routing it
        source: kind === 'fork' ? p : c.sha,
        target: kind === 'fork' ? c.sha : p,
        colour: i === 0 ? colourOf(c.sha) : colourOf(p),
        kind,
        reachable: reachable.has(c.sha),
      }
    }),
  )

  // Right-hand column: "C4" label, then HEAD, branch and tag pills.
  const labelX = (laneColour.length - 1) * COL + DIAMETER / 2 + 20
  const labels: LaidLabel[] = []
  const pills: LaidPill[] = []
  let maxX = labelX

  laid.forEach((c) => {
    labels.push({ id: `label:${c.sha}`, text: c.label, x: labelX, y: c.y, reachable: c.reachable })
    let cursor = labelX + Math.max(textWidth(c.label, 12), 24) + 14

    const refs: Omit<LaidPill, 'x' | 'y' | 'width'>[] = []
    if (c.head) refs.push({ id: 'pill:HEAD', kind: 'head', text: 'HEAD', colour: colours.ink })
    for (const name of branchNames) {
      if (state.branches[name] === c.sha) refs.push({ id: `pill:branch:${name}`, kind: 'branch', text: name, colour: branchColour.get(name)! })
    }
    for (const name of Object.keys(state.remoteTracking).sort()) {
      if (state.remoteTracking[name] === c.sha) {
        refs.push({ id: `pill:remote:${name}`, kind: 'remote', text: `origin/${name}`, colour: remoteColours.get(name)! })
      }
    }
    for (const name of Object.keys(state.tags).sort()) {
      if (state.tags[name] === c.sha) refs.push({ id: `pill:tag:${name}`, kind: 'tag', text: name, colour: c.colour })
    }
    for (const r of refs) {
      const width = textWidth(r.text, 11) + 20
      pills.push({ ...r, x: cursor + width / 2, y: c.y, width })
      cursor += width + 6
    }
    maxX = Math.max(maxX, cursor)
  })

  const r = DIAMETER / 2
  return {
    commits: laid,
    edges,
    labels,
    pills,
    bounds: { x1: -r, y1: rowY(commits.length - 1) - r, x2: maxX, y2: r },
  }
}
