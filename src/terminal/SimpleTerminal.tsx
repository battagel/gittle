import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { TermLine, TerminalProps } from './terminal'

const lineClass: Record<TermLine['kind'], string> = {
  input: 'text-ink',
  info: 'text-ink/80',
  error: 'text-coral',
  hint: 'text-muted italic',
}

/** Our own lightweight terminal: scrollback, a prompt, and ↑/↓ history. */
export function SimpleTerminal({ lines, prompt, onSubmit, typing = null, disabled = false }: TerminalProps) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState<number | null>(null) // index into history while browsing
  const input = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [lines, typing])

  useEffect(() => {
    if (typing === null && !disabled) input.current?.focus()
  }, [typing, disabled])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (value.trim()) setHistory((h) => [...h, value])
      onSubmit(value)
      setValue('')
      setCursor(null)
    } else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1)
      setCursor(next)
      setValue(history[next])
    } else if (e.key === 'ArrowDown' && cursor !== null) {
      e.preventDefault()
      const next = cursor + 1
      setCursor(next < history.length ? next : null)
      setValue(next < history.length ? history[next] : '')
    }
  }

  return (
    <div
      ref={scroller}
      className="h-full overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed [font-variant-ligatures:none]"
      // only empty space focuses the input: clicks on output must stay free for selecting and copying. A drag across
      // several lines also ends in a click here, and focusing the input would wipe the selection
      onClick={(e) => e.target === e.currentTarget && !window.getSelection()?.toString() && input.current?.focus()}
    >
      {lines.map((line, i) => (
        <div key={i} className={`cursor-text whitespace-pre-wrap break-words select-text ${lineClass[line.kind]}`}>
          {line.kind === 'input' && <span className="text-muted">{line.prompt} </span>}
          {line.text || '\u00a0'}
        </div>
      ))}
      <label className="flex items-baseline gap-2">
        <span className="shrink-0 text-muted">{prompt}</span>
        <input
          ref={input}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className="min-w-0 flex-1 bg-transparent text-ink caret-indigo outline-none"
          value={typing ?? value}
          readOnly={typing !== null || disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => typing === null && !disabled && onKeyDown(e)}
        />
      </label>
    </div>
  )
}
