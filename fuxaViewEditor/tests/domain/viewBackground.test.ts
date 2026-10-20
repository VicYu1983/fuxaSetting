import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import {
  getViewBackgroundInputColor,
  toStoredViewBackgroundColor,
  toViewBackgroundInputColor,
  updateAllViewBackgrounds,
} from '../../src/domain/views/viewBackground'

function createConfig(): FuxaConfig {
  return {
    devices: {},
    hmi: {
      views: [
        { id: 'first', name: 'First', profile: { width: 1024, height: 768, bkcolor: '#ffffffff' } },
        { id: 'second', name: 'Second', profile: { width: 800, height: 600, bkcolor: '#123456ff' } },
        { id: 'no-profile', name: 'No profile' },
      ],
    },
    extra: { preserve: true },
  }
}

describe('viewBackground', () => {
  it('converts FUXA bkcolor values to color input values', () => {
    expect(toViewBackgroundInputColor('#ABCDEF80')).toBe('#abcdef')
    expect(toViewBackgroundInputColor('#abc')).toBe('#aabbcc')
    expect(toViewBackgroundInputColor('#abcd')).toBe('#aabbcc')
    expect(toViewBackgroundInputColor('not-a-color')).toBe('#ffffff')
    expect(toViewBackgroundInputColor(undefined)).toBe('#ffffff')
  })

  it('stores colors as opaque 8-digit hex values', () => {
    expect(toStoredViewBackgroundColor('#F4F5F7')).toBe('#f4f5f7ff')
    expect(() => toStoredViewBackgroundColor('#fff')).toThrow('不是有效的 #rrggbb 色碼')
  })

  it('reads the background color of a view by index', () => {
    const config = createConfig()

    expect(getViewBackgroundInputColor(config, 1)).toBe('#123456')
    expect(getViewBackgroundInputColor(config, 2)).toBe('#ffffff')
  })

  it('applies one background color to every view without mutating the source', () => {
    const source = createConfig()

    const result = updateAllViewBackgrounds(source, '#336699')

    expect(result.changed).toBe(true)
    expect(result.config.hmi.views).toEqual([
      { id: 'first', name: 'First', profile: { width: 1024, height: 768, bkcolor: '#336699ff' } },
      { id: 'second', name: 'Second', profile: { width: 800, height: 600, bkcolor: '#336699ff' } },
      { id: 'no-profile', name: 'No profile', profile: { bkcolor: '#336699ff' } },
    ])
    expect(result.config.extra).toEqual({ preserve: true })
    expect(source).toEqual(createConfig())
  })

  it('returns the original config when every view already uses the color', () => {
    const source = updateAllViewBackgrounds(createConfig(), '#336699').config

    const result = updateAllViewBackgrounds(source, '#336699')

    expect(result.changed).toBe(false)
    expect(result.config).toBe(source)
  })
})
