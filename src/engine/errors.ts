/** A git-style failure. Thrown inside commands; `run` turns it into error output and discards the draft state. */
export class GitError extends Error {
  readonly lines: string[]
  readonly hints: string[]

  constructor(lines: string | string[], hints: string[] = []) {
    const all = Array.isArray(lines) ? lines : [lines]
    super(all.join('\n'))
    this.lines = all
    this.hints = hints
  }
}

export function fail(message: string, ...hints: string[]): never {
  throw new GitError(message, hints)
}
