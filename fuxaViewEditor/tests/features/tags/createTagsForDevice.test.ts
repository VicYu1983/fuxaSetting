import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../../src/domain/config/types'
import { parseTagBatchInput } from '../../../src/domain/tags/batch'
import type { RandomValuesProvider } from '../../../src/domain/ids'
import { createTagsForDevice } from '../../../src/features/tags/createTagsForDevice'

function incrementingRandom(): RandomValuesProvider {
  let value = 1
  return {
    getRandomValues(bytes) {
      bytes.fill(value++)
      return bytes
    },
  }
}

describe('createTagsForDevice', () => {
  it('creates tags and fills configured Modbus address gaps without mutating the source', () => {
    const source: FuxaConfig = {
      devices: {
        'device-1': {
          id: 'device-1',
          name: 'Panel',
          type: 'ModbusTCP',
          property: { addressCount: 3 },
          tags: {
            existing: {
              id: 'existing',
              name: 'Existing',
              type: 'Bool',
              memaddress: '000000',
              address: 10,
            },
          },
        },
      },
      hmi: { views: [] },
    }
    const specs = parseTagBatchInput('New Tag', {
      startAddress: 11,
      defaultMemAddress: '000000',
    })

    const result = createTagsForDevice(source, 'device-1', specs, incrementingRandom())

    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({
      name: 'New Tag',
      address: 11,
      memaddress: '000000',
    })
    expect(result.autoFilled).toHaveLength(1)
    expect(result.autoFilled[0]).toMatchObject({ name: '補位_12', address: 12 })
    expect(Object.keys((source.devices['device-1'] as { tags: object }).tags)).toEqual(['existing'])
    expect(Object.keys((result.config.devices['device-1'] as { tags: object }).tags)).toHaveLength(3)
  })

  it('rejects an invalid Modbus fill range without changing the source', () => {
    const source: FuxaConfig = {
      devices: {
        'device-1': {
          id: 'device-1',
          type: 'ModbusTCP',
          property: { addressCount: 2 },
          tags: {},
        },
      },
      hmi: { views: [] },
    }
    const specs = parseTagBatchInput('Boundary', {
      startAddress: 65535,
      defaultMemAddress: '000000',
    })

    expect(() => createTagsForDevice(
      source,
      'device-1',
      specs,
      incrementingRandom(),
    )).toThrow('超出 Modbus 位址範圍')
    expect((source.devices['device-1'] as { tags: object }).tags).toEqual({})
  })
})
