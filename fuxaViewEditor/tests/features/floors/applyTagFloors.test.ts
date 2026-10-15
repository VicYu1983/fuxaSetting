import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../../src/domain/config/types'
import { buildTagIndex } from '../../../src/domain/tags/index'
import { applyTagFloors } from '../../../src/features/floors/applyTagFloors'

describe('applyTagFloors', () => {
  it('updates only extra.floor and preserves other metadata and unrelated config', () => {
    const source: FuxaConfig = {
      devices: {
        device1: {
          name: 'Pump',
          tags: {
            tag1: {
              id: 'tag1',
              name: 'Pump',
              extra: { floor: '1f', custom: 'keep' },
              description: 'preserve',
            },
            tag2: {
              id: 'tag2',
              name: 'Valve',
              extra: { custom: { enabled: true } },
            },
          },
        },
      },
      hmi: { views: [] },
      extra: { untouched: true },
    }

    const result = applyTagFloors(source, ['tag1', 'tag2'], ' b02f ')
    const tags = buildTagIndex(result.config)
    expect(result.changedCount).toBe(2)
    expect(tags.get('tag1')?.record).toMatchObject({
      extra: { floor: 'B2F', custom: 'keep' },
      description: 'preserve',
    })
    expect(tags.get('tag2')?.record.extra).toEqual({
      custom: { enabled: true },
      floor: 'B2F',
    })
    expect(result.config.extra).toEqual({ untouched: true })
    expect(buildTagIndex(source).get('tag1')?.record.extra).toEqual({
      floor: '1f',
      custom: 'keep',
    })
  })

  it('removes only the floor key when clearing and avoids history for unchanged values', () => {
    const source: FuxaConfig = {
      devices: {
        device: {
          tags: {
            tag1: { id: 'tag1', name: 'A', extra: { floor: '1F', custom: 1 } },
            tag2: { id: 'tag2', name: 'B', extra: { floor: '2F' } },
          },
        },
      },
      hmi: { views: [] },
    }

    const unchanged = applyTagFloors(source, ['tag1'], '1f')
    expect(unchanged.changedCount).toBe(0)
    const cleared = applyTagFloors(source, ['tag2'], '')
    expect(cleared.changedCount).toBe(1)
    expect(buildTagIndex(cleared.config).get('tag2')?.record).not.toHaveProperty('extra')
    expect(buildTagIndex(cleared.config).get('tag1')?.record.extra).toEqual({
      floor: '1F',
      custom: 1,
    })
  })

  it('ignores unknown IDs without changing other tags', () => {
    const source: FuxaConfig = {
      devices: { device: { tags: { tag1: { id: 'tag1', name: 'A' } } } },
      hmi: { views: [] },
    }
    const result = applyTagFloors(source, ['missing'], '4F')
    expect(result.changedCount).toBe(0)
    expect(buildTagIndex(result.config).get('tag1')?.floor).toBe('')
  })
})
