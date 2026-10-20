import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import {
  deviceTagsNeedAddressSorting,
  sortDeviceTagsByAddress,
  sortTagEntriesByAddress,
} from '../../src/domain/devices/deviceTagAddressSort'

describe('device Tag address sorting', () => {
  it('sorts numeric addresses ascending and keeps equal or invalid addresses stable', () => {
    const entries: [string, Record<string, unknown>][] = [
      ['missing', { name: 'Missing' }],
      ['ten', { address: 10 }],
      ['two', { address: '2' }],
      ['blank', { address: '' }],
      ['same-a', { address: 2 }],
      ['same-b', { address: 2 }],
    ]

    expect(sortTagEntriesByAddress(entries).map(([id]) => id)).toEqual([
      'two',
      'same-a',
      'same-b',
      'ten',
      'missing',
      'blank',
    ])
  })

  it('reorders device Tag objects for export without mutating the source config', () => {
    const config: FuxaConfig = {
      devices: {
        device1: {
          type: 'ModbusTCP',
          tags: {
            later: { id: 'later', address: 20 },
            earlier: { id: 'earlier', address: 3 },
          },
        },
      },
      hmi: { views: [] },
    }
    const output = structuredClone(config)

    expect(deviceTagsNeedAddressSorting(config)).toBe(true)

    sortDeviceTagsByAddress(output)

    const tags = (output.devices.device1 as { tags: Record<string, unknown> }).tags
    expect(Object.keys(tags)).toEqual(['earlier', 'later'])
    expect(deviceTagsNeedAddressSorting(output)).toBe(false)
    expect(Object.keys((config.devices.device1 as { tags: object }).tags)).toEqual([
      'later',
      'earlier',
    ])
  })
})
