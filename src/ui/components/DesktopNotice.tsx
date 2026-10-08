/** gittle is desktop-only for now: say so on small screens instead of showing a cramped layout without warning. */
export function DesktopNotice() {
  return (
    <div className="fixed inset-x-3 bottom-3 z-30 rounded-2xl bg-ink px-4 py-3 text-center text-sm text-paper shadow-xl lg:hidden">
      gittle is built for a desktop screen with a keyboard. It works best on a laptop or bigger.
    </div>
  )
}
