/** Tiny renderer for level briefs: paragraphs, `code` and *emphasis*. Enough for now; swap for markdown if needed. */
export function Brief({ text, inline = false }: { text: string; inline?: boolean }) {
  if (inline) return <>{spans(text)}</>
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>{spans(para)}</p>
      ))}
    </div>
  )
}

function spans(text: string) {
  return text.split(/(`[^`]+`|\*[^*]+\*)/).map((part, j) =>
    part.startsWith('`') ? (
      <code key={j} className="rounded bg-paper px-1.5 py-0.5 font-mono text-[12px] ring-1 ring-line">
        {part.slice(1, -1)}
      </code>
    ) : part.startsWith('*') ? (
      <em key={j}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  )
}
