import confetti from 'canvas-confetti'
import { branchPalette } from '../../theme'

/** A short celebratory burst from both bottom corners, in the branch colours. */
export function celebrate() {
  const base = { colors: branchPalette, disableForReducedMotion: true, ticks: 220, zIndex: 50 }
  confetti({ ...base, particleCount: 90, angle: 60, spread: 70, startVelocity: 55, origin: { x: 0, y: 0.9 } })
  confetti({ ...base, particleCount: 90, angle: 120, spread: 70, startVelocity: 55, origin: { x: 1, y: 0.9 } })
  setTimeout(() => confetti({ ...base, particleCount: 60, spread: 110, startVelocity: 35, origin: { x: 0.5, y: 0.35 } }), 250)
}
