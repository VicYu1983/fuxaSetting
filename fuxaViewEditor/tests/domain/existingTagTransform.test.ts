import { describe, expect, it } from 'vitest'
import { existingTagTransform } from '../../src/domain/svg/existingTagTransform'

describe('existingTagTransform', () => {
  it('returns an empty transform for unchanged or sub-threshold position', () => {
    expect(existingTagTransform({ x: 12, y: 25 }, { x: 12, y: 25 })).toBe('')
    expect(existingTagTransform({ x: 0, y: 0 }, { x: 0.0009, y: -0.0009 })).toBe('')
  })

  it('returns a translation rounded to three decimal places', () => {
    expect(existingTagTransform(
      { x: 10.125, y: 20.5 },
      { x: 15.5556, y: 18.2222 },
    )).toBe('translate(5.431 -2.278)')
  })
})
