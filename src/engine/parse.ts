import { fail } from './errors'

/**
 * Split a command line into tokens. Quotes group words, but only when they open a token,
 * so labels like C4' pass through untouched.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < input.length) {
    if (/\s/.test(input[i])) {
      i++
      continue
    }
    const q = input[i]
    if (q === '"' || q === "'") {
      const end = input.indexOf(q, i + 1)
      if (end === -1) fail(`fatal: unterminated ${q === '"' ? 'double' : 'single'} quote`)
      tokens.push(input.slice(i + 1, end))
      i = end + 1
    } else {
      let j = i
      while (j < input.length && !/\s/.test(input[j])) j++
      tokens.push(input.slice(i, j))
      i = j
    }
  }
  return tokens
}

export interface ArgSpec {
  /** boolean flags: spelling -> canonical name, e.g. { '-d': 'delete', '--delete': 'delete' } */
  flags?: Record<string, string>
  /** options taking a value: spelling -> canonical name, e.g. { '-m': 'message' } */
  options?: Record<string, string>
}

export interface ParsedArgs {
  flags: Set<string>
  options: Record<string, string>
  positional: string[]
}

export function parseArgs(args: string[], spec: ArgSpec): ParsedArgs {
  const flags = new Set<string>()
  const options: Record<string, string> = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--') {
      positional.push(...args.slice(i + 1))
      break
    }
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg)
      continue
    }
    const [name, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s) : [arg, undefined]
    if (spec.flags?.[name]) {
      flags.add(spec.flags[name])
    } else if (spec.options?.[name]) {
      const value = inline ?? args[++i]
      if (value === undefined) fail(`error: option \`${name.replace(/^-+/, '')}' requires a value`)
      options[spec.options[name]] = value
    } else {
      fail(`error: unknown option \`${name.replace(/^-+/, '')}'`)
    }
  }
  return { flags, options, positional }
}
