import type { Effect, RepoState } from '../engine'

/** The rest of the app only talks to this, so the drawing library (or a 3D version) can be swapped. */
export interface GraphRenderer {
  mount(el: HTMLElement): void
  /** Draw `state`, animating from the previous one. Resolves when the animation is done. */
  update(state: RepoState, effects?: Effect[]): Promise<void>
  fit(): void
  destroy(): void
}

export interface RendererOptions {
  onCommitClick?: (sha: string) => void
  /** false for decorative graphs (the landing demo): no pan, zoom or clicks. */
  interactive?: boolean
}
