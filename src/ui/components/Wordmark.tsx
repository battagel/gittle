const dots = ['bg-indigo', 'bg-coral', 'bg-mint', 'bg-amber']

export function Wordmark({ size = 'text-2xl' }: { size?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${size}`}>
      <span className="inline-flex gap-1">
        {dots.map((d) => (
          <span key={d} className={`size-[0.35em] rounded-full ${d}`} />
        ))}
      </span>
      gittle
    </span>
  )
}
