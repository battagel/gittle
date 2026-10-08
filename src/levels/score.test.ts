import { describe, expect, it } from 'vitest'
import { golfResult, points } from './score'

describe('points', () => {
  it('gives 100 at par, +25 per stroke under, −30% per stroke over, floors at 10', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map((over) => points(3 + over, 3))).toEqual([100, 70, 49, 34, 24, 17, 12, 10, 10])
    expect([1, 2, 3, 4].map((under) => points(5 - under, 5))).toEqual([125, 150, 175, 200])
  })
})

describe('golfResult', () => {
  it('names results relative to par', () => {
    expect(golfResult(3, 3)).toBe('Par')
    expect(golfResult(2, 3)).toBe('Birdie')
    expect(golfResult(4, 3)).toBe('Bogey')
    expect(golfResult(5, 3)).toBe('Double bogey')
    expect(golfResult(9, 3)).toBe('+6')
  })

  it('awards a hole in one only when par is 2 or more', () => {
    expect(golfResult(1, 3)).toBe('Hole in one!')
    expect(golfResult(1, 1)).toBe('Par')
  })
})
