import type { RepoState, Sha } from './state'

// cyrb53: small, fast, well-distributed string hash. Shas are fake, they only need to be stable and unique.
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Deterministic short sha from the level seed, the commit's label and its parents. */
export function makeSha(state: RepoState, label: string, parents: Sha[]): Sha {
  for (let salt = 0; ; salt++) {
    const sha = cyrb53(`${state.seed}|${label}|${parents.join(',')}|${salt}`)
      .toString(16)
      .padStart(14, '0')
      .slice(-7)
    if (!state.commits[sha]) return sha
  }
}

/** The full 40-hex sha. Shas are stored short; the rest is derived, so the short sha is always its prefix. */
export function fullSha(state: RepoState, sha: Sha): string {
  let full = sha
  for (let i = 0; full.length < 40; i++) {
    full += cyrb53(`${state.seed}|${sha}|full|${i}`).toString(16).padStart(14, '0')
  }
  return full.slice(0, 40)
}
