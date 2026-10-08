import { describe, expect, it } from 'vitest'
import { playAll } from '../levels/load'
import { createRepo } from '../engine'
import { layout } from './layout'

const labelled = (cmds: string[]) => {
  const state = playAll(createRepo('t'), cmds, 'test')
  const label = (sha: string) => state.commits[sha].label
  return layout(state).edges.map((e) => `${label(e.source)}-${e.kind}-${label(e.target)}`)
}

describe('layout edges', () => {
  it('draws a fork from the real parent, sideways out of it, even when main moved on', () => {
    // `new` branches from C0; main's C1 must not look like part of new's history
    const edges = labelled(['git branch new', 'git commit', 'git switch new', 'git commit'])
    expect(edges).toContain('C0-fork-C2')
    expect(edges).toContain('C1-straight-C0')
  })

  it('draws a merge sideways into the merge commit', () => {
    const edges = labelled(['git switch -c f', 'git commit', 'git switch main', 'git commit', 'git merge f'])
    expect(edges).toContain('C3-straight-C2')
    expect(edges).toContain('C3-merge-C1')
  })
})
