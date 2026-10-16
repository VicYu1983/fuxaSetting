import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../../src/domain/config/types'
import {
  deleteModbusDeviceTag,
  updateModbusDeviceTag,
} from '../../../src/features/devices/manageDeviceTags'

function createConfig(): FuxaConfig {
  return {
    devices: {
      device1: {
        id: 'device1',
        type: 'ModbusTCP',
        tags: {
          tag1: {
            id: 'tag-1',
            name: 'Pump',
            type: 'Bool',
            address: 12,
            memaddress: '000000',
            description: 'Original',
            timestamp: 1,
            extra: { floor: '2F', keep: true },
          },
        },
      },
    },
    hmi: { views: [] },
  }
}

describe('Modbus device Tag management', () => {
  it('updates editable fields, normalizes the floor, and preserves other Tag data', () => {
    const source = createConfig()
    const updated = updateModbusDeviceTag(
      source,
      'device1',
      'tag-1',
      {
        name: '  Pump  ',
        address: 14,
        type: 'number',
        memaddress: '400000',
        description: ' Updated ',
        floor: ' b1f ',
      },
      () => 20,
    )
    const tag = (updated.devices.device1 as {
      tags: Record<string, Record<string, unknown>>
    }).tags.tag1

    expect(tag).toMatchObject({
      id: 'tag-1',
      name: 'Pump',
      address: 14,
      type: 'number',
      memaddress: '400000',
      description: 'Updated',
      timestamp: 20,
      extra: { floor: 'B1F', keep: true },
    })
    expect((source.devices.device1 as { tags: object }).tags).toHaveProperty('tag1')
  })

  it('preserves an existing address if the form does not submit one, and can clear it explicitly', () => {
    const source = createConfig()
    const update = {
      name: 'Pump',
      type: 'Bool',
      memaddress: '000000',
      description: '',
      floor: '',
    }

    const unchangedAddress = updateModbusDeviceTag(source, 'device1', 'tag-1', update)
    const clearedAddress = updateModbusDeviceTag(
      source,
      'device1',
      'tag-1',
      { ...update, address: null },
    )

    const unchangedTag = (unchangedAddress.devices.device1 as {
      tags: Record<string, { address: number }>
    }).tags.tag1
    expect(unchangedTag?.address).toBe(12)
    const clearedTag = (clearedAddress.devices.device1 as {
      tags: Record<string, object>
    }).tags.tag1
    expect(clearedTag).toBeDefined()
    expect(Object.hasOwn(clearedTag ?? {}, 'address')).toBe(false)
  })

  it('rejects invalid fields without changing the source', () => {
    const source = createConfig()
    const original = structuredClone(source)

    expect(() => updateModbusDeviceTag(source, 'device1', 'tag-1', {
      name: ' ',
      address: 65536,
      type: 'Bool',
      memaddress: '000000',
      description: '',
      floor: '',
    })).toThrow('Tag 名稱不可空白')
    expect(source).toEqual(original)
  })

  it('deletes a Tag from a cloned device without affecting sibling Tags', () => {
    const source = createConfig()
    const deleted = deleteModbusDeviceTag(source, 'device1', 'tag-1')

    expect((deleted.devices.device1 as { tags: object }).tags).toEqual({})
    expect((source.devices.device1 as { tags: object }).tags).toHaveProperty('tag1')
  })
})
