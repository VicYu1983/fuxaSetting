import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../../src/domain/config/types'
import { DEFAULT_FLOOR_GROUP_FRAME } from '../../../src/domain/layout/floorGroupFrame'
import { updateFloorGroupFrame } from '../../../src/features/floors/updateFloorGroupFrame'

describe('updateFloorGroupFrame', () => {
  it('updates normalized settings without mutating or discarding existing config metadata', () => {
    const source: FuxaConfig = {
      devices: {},
      hmi: { views: [] },
      extra: {
        preserve: true,
        fuxaSetting: {
          customSetting: 'keep',
          icons: [],
        },
      },
    }

    const result = updateFloorGroupFrame(source, {
      ...DEFAULT_FLOOR_GROUP_FRAME,
      fill: '#ABCDEF',
      fillOpacity: 0.75,
      padding: 40,
    })

    expect(result.changed).toBe(true)
    expect(result.config.extra).toMatchObject({
      preserve: true,
      fuxaSetting: {
        customSetting: 'keep',
        icons: [],
        floorGroupFrames: {
          ...DEFAULT_FLOOR_GROUP_FRAME,
          fill: '#abcdef',
          fillOpacity: 0.75,
          padding: 40,
        },
      },
    })
    expect(source.extra).toEqual({
      preserve: true,
      fuxaSetting: { customSetting: 'keep', icons: [] },
    })
  })

  it('does not create a history-worthy config change when the normalized settings match', () => {
    const source: FuxaConfig = {
      devices: {},
      hmi: { views: [] },
      extra: { fuxaSetting: { floorGroupFrames: { ...DEFAULT_FLOOR_GROUP_FRAME } } },
    }

    const result = updateFloorGroupFrame(source, DEFAULT_FLOOR_GROUP_FRAME)

    expect(result.changed).toBe(false)
    expect(result.config).toBe(source)
  })
})
