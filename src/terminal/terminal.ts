import type { ComponentType } from 'react'
import type { OutputKind } from '../engine'

export type TermLine = { kind: 'input'; prompt: string; text: string } | { kind: OutputKind; text: string }

/**
 * Any terminal implementation (ours, or xterm.js later) is a component with these props.
 * The game owns the lines; the terminal only displays them and reports what was typed.
 */
export interface TerminalProps {
  lines: TermLine[]
  prompt: string
  onSubmit: (input: string) => void
  /** When set, the game is typing for the player (hint replay): show this text and ignore the keyboard. */
  typing?: string | null
  /** No input at all (e.g. the level is won). */
  disabled?: boolean
}

export type TerminalComponent = ComponentType<TerminalProps>
