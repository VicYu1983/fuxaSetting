import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../../src/domain/config/types'
import { isRecord } from '../../../src/domain/config/validateFuxaConfig'
import {
  fillModbusDeviceAddressGaps,
  saveModbusDevice,
  shiftModbusDeviceTags,
} from '../../../src/features/devices/manageModbusDevice'

function configWithDevice(address: number): FuxaConfig {
  return {
    devices: {
      '0': { name: 'FUXA', tags: {} },
      device1: {
        id: 'device1',
        name: 'Pump Room',
        type: 'ModbusTCP',
        enabled: true,
        polling: 200,
        property: { address: '127.0.0.1:502', addressCount: 3 },
        tags: {
          tag1: {
            id: 'tag1',
            name: 'Pump',
            type: 'Bool',
            memaddress: '000000',
            address,
            daq: { enabled: true, interval: 15 },
          },
        },
      },
    },
    hmi: { views: [] },
  }
}

function randomIds() {
  let value = 1
  return {
    getRandomValues(bytes: Uint8Array<ArrayBuffer>) {
      bytes.fill(value++)
      return bytes
    },
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected record')
  return value
}

describe('Modbus device feature operations', () => {
  it('preflights range changes and fills gaps from the lowest-address Tag', () => {
    const source = configWithDevice(10)
    const result = saveModbusDevice(
      source,
      'device1',
      { name: 'Pump Room', address: '127.0.0.1:502', addressCount: 3, enabled: true, polling: 200 },
      randomIds(),
    )

    const tags = Object.values(record(record(result.config.devices.device1).tags))
      .filter(isRecord)
    expect(result.fill.created).toHaveLength(2)
    expect(tags.map((tag) => tag.address)).toEqual([10, 11, 12])
    expect(tags[1]).toMatchObject({
      name: '補位_11',
      description: '自動補位點位',
      memaddress: '000000',
    })
    expect(tags[1]?.daq).toEqual({ enabled: true, interval: 15 })
    expect(record(record(record(source.devices.device1).tags).tag1)).toMatchObject({ address: 10 })
  })

  it('rejects an expanded range without saving any device changes', () => {
    const source = configWithDevice(65534)
    const original = structuredClone(source)

    expect(() => saveModbusDevice(
      source,
      'device1',
      { name: 'Renamed', address: '192.168.1.99:502', addressCount: 4, enabled: false },
      randomIds(),
    )).toThrow('超出 Modbus 位址範圍')
    expect(source).toEqual(original)
  })

  it('does not mutate the source device when a whole-device shift crosses a boundary', () => {
    const source = configWithDevice(0)
    const tags = record(record(source.devices.device1).tags)
    tags.tag2 = { address: 65535 }

    expect(() => shiftModbusDeviceTags(source, 'device1', -1))
      .toThrow('未修改任何 Tag')
    expect(record(tags.tag1).address).toBe(0)
    expect(record(tags.tag2).address).toBe(65535)
  })

  it('shifts every valid Tag in the selected device regardless of memaddress', () => {
    const source = configWithDevice(0)
    const tags = record(record(source.devices.device1).tags)
    tags.tag2 = { address: '19', memaddress: '000100' }

    const result = shiftModbusDeviceTags(source, 'device1', 1)
    const shiftedTags = record(record(result.config.devices.device1).tags)
    expect(shiftedTags)
      .toMatchObject({ tag1: { address: 1 }, tag2: { address: '20' } })
  })

  it('creates a ModbusTCP device and its connection status Tag', () => {
    const source: FuxaConfig = {
      devices: { '0': { id: '0', name: 'FUXA', tags: {} } },
      hmi: { views: [] },
    }
    const result = saveModbusDevice(
      source,
      '',
      { name: 'New Device', address: '192.168.1.20:502', addressCount: 0, enabled: true },
      randomIds(),
    )
    expect(result.created).toBe(true)
    expect(record(result.config.devices[result.deviceId])).toMatchObject({
      type: 'ModbusTCP',
      name: 'New Device',
      property: { address: '192.168.1.20:502', addressCount: 0 },
    })
    expect(Object.values(record(record(result.config.devices['0']).tags)))
      .toContainEqual(expect.objectContaining({
        name: 'New Device Connection Status',
        memaddress: result.deviceId,
        sysType: 1,
      }))
  })

  it('fills an existing device by preserving unrelated config and returns no edits without a gap', () => {
    const source = configWithDevice(10)
    source.extra = { preserve: true }

    const filled = fillModbusDeviceAddressGaps(source, 'device1', randomIds())
    expect(filled.fill.created).toHaveLength(2)
    expect(filled.config.extra).toEqual({ preserve: true })
    const again = fillModbusDeviceAddressGaps(filled.config, 'device1', randomIds())
    expect(again.fill.created).toHaveLength(0)
  })
})
