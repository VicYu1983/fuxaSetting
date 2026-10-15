import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import { buildTagIndex } from '../../src/domain/tags'

describe('buildTagIndex', () => {
  it('indexes tags by id and carries normalized floor and device metadata', () => {
    const tag = {
      id: 'tag-id',
      name: 'Pump',
      type: 'number',
      extra: { floor: 'b01f' },
      custom: 'retained',
    }
    const config: FuxaConfig = {
      devices: {
        d1: {
          name: 'Device One',
          tags: {
            tagKey: tag,
            fallbackName: { type: 'Bool' },
            invalid: null,
          },
        },
        d2: { tags: { other: { name: 'Other', type: 12 } } },
        invalid: null,
      },
      hmi: { views: [] },
    }

    const index = buildTagIndex(config)
    expect(index.size).toBe(3)
    expect(index.get('tag-id')).toEqual({
      id: 'tag-id',
      name: 'Pump',
      type: 'number',
      deviceId: 'd1',
      deviceName: 'Device One',
      floor: 'B1F',
      record: tag,
    })
    expect(index.get('fallbackName')).toMatchObject({
      name: 'fallbackName',
      type: 'Bool',
      deviceName: 'Device One',
      floor: '',
    })
    expect(index.get('other')).toMatchObject({
      deviceId: 'd2',
      deviceName: 'd2',
      type: '',
    })
  })

  it('uses the last indexed record when ids collide, matching legacy behavior', () => {
    const config: FuxaConfig = {
      devices: {
        first: { tags: { shared: { id: 'same', name: 'first' } } },
        second: { tags: { shared: { id: 'same', name: 'second' } } },
      },
      hmi: { views: [] },
    }
    expect(buildTagIndex(config).get('same')?.name).toBe('second')
  })
})
