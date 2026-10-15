import { describe, expect, it } from 'vitest'
import {
  createModbusTcpDevice,
  fillModbusTcpAddressGaps,
  getModbusTcpAddressFillPlan,
  getModbusTcpAddressShiftPlan,
  shiftModbusTcpAddresses,
  updateModbusTcpDevice,
} from '../../src/domain/devices/modbusTcp'
import { generateId, type RandomValuesProvider } from '../../src/domain/ids'
import {
  batchCreateTags,
  getNextAvailableAddress,
  parseTagBatchInput,
} from '../../src/domain/tags/batch'

function fixedRandom(byte: number): RandomValuesProvider {
  return {
    getRandomValues(bytes) {
      bytes.fill(byte)
      return bytes
    },
  }
}

function incrementingRandom(firstByte: number): RandomValuesProvider {
  let byte = firstByte
  return {
    getRandomValues(bytes) {
      bytes.fill(byte++)
      return bytes
    },
  }
}

describe('ID generation', () => {
  it('retries collisions and reserves the accepted ID', () => {
    let attempt = 0
    const cryptoProvider: RandomValuesProvider = {
      getRandomValues(bytes) {
        bytes.fill(attempt++ === 0 ? 7 : 8)
        return bytes
      },
    }
    const usedIds = new Set(['t_07070707-07070707'])
    expect(generateId('t', usedIds, cryptoProvider)).toBe('t_08080808-08080808')
    expect(usedIds).toContain('t_08080808-08080808')
  })
})

describe('Modbus TCP domain', () => {
  it('creates and updates device settings with address-count validation', () => {
    const device = createModbusTcpDevice({
      name: '  14F ',
      address: ' 192.168.1.14:502 ',
      slaveid: '2',
      polling: 300,
      enabled: true,
    }, new Set(), fixedRandom(7))

    expect(device).toMatchObject({
      id: 'd_07070707-07070707',
      name: '14F',
      type: 'ModbusTCP',
      enabled: true,
      polling: 300,
      property: { address: '192.168.1.14:502', slaveid: '2', addressCount: 0 },
      tags: {},
    })
    updateModbusTcpDevice(device, {
      name: '14F-Renamed',
      address: '192.168.1.15:502',
      addressCount: 4,
      enabled: false,
      polling: 500,
    })
    expect(device.name).toBe('14F-Renamed')
    expect(device.property).toMatchObject({ address: '192.168.1.15:502', addressCount: 4 })
    expect(device.enabled).toBe(false)
    expect(device.polling).toBe(500)
    expect(() => createModbusTcpDevice({ name: '' }, new Set(), fixedRandom(1)))
      .toThrow('設備名稱不可空白')
    expect(() => updateModbusTcpDevice(device, { addressCount: 65537 }))
      .toThrow('地址數量')
  })

  it('plans and fills only missing addresses in the anchor memory area', () => {
    const device = {
      property: { addressCount: 4 },
      tags: {
        'tag-12': {
          id: 'tag-12', name: 'Point 12', type: 'number', memaddress: '400000',
          address: 12, divisor: 10, daq: { enabled: true, interval: 15 },
        },
        'tag-10': {
          id: 'tag-10', name: 'Point 10', type: 'number', memaddress: '400000',
          address: 10, divisor: 10, daq: { enabled: true, interval: 15 },
        },
        other: { id: 'other', name: 'Other area', type: 'Bool', memaddress: '000000', address: 11 },
      },
    }
    expect(getModbusTcpAddressFillPlan(device).missing).toEqual([11, 13])

    const usedTagIds = new Set(Object.keys(device.tags))
    const result = fillModbusTcpAddressGaps(
      device,
      usedTagIds,
      incrementingRandom(3),
      () => 123,
    )
    expect(result.created.map(({ name, address }) => [name, address])).toEqual([
      ['補位_11', 11],
      ['補位_13', 13],
    ])
    expect(result.created[0]).toMatchObject({
      id: 't_03030303-03030303',
      type: 'number',
      memaddress: '400000',
      divisor: 10,
      description: '自動補位點位',
      timestamp: 123,
    })
    const firstCreated = result.created[0]
    if (!firstCreated) throw new Error('Expected first gap Tag to be created')
    expect(firstCreated.daq).not.toBe(device.tags['tag-10'].daq)
    expect(device.tags['tag-12'].name).toBe('Point 12')
    expect(fillModbusTcpAddressGaps(device, usedTagIds, fixedRandom(4)).created).toEqual([])
  })

  it('waits for an anchor and rejects out-of-range address fills', () => {
    expect(getModbusTcpAddressFillPlan({
      property: { addressCount: 32 },
      tags: {},
    })).toEqual({ count: 32, missing: [], hasAnchor: false })
    expect(() => getModbusTcpAddressFillPlan({
      property: { addressCount: 2 },
      tags: { high: { address: 65535, memaddress: '000000' } },
    })).toThrow('超出 Modbus 位址範圍')
  })

  it('plans shifts across memory areas and rejects boundary changes atomically', () => {
    const device = {
      type: 'ModbusTCP',
      tags: {
        coil: { address: 1, memaddress: '000000' },
        register: { address: '10', memaddress: '400000' },
        invalid: { address: 'not-an-address', memaddress: '300000' },
      },
    }
    expect(getModbusTcpAddressShiftPlan(device, 1)).toMatchObject({
      count: 2,
      skippedInvalid: 1,
    })
    expect(shiftModbusTcpAddresses(device, 1)).toEqual({ count: 2, skippedInvalid: 1 })
    expect(device.tags.coil.address).toBe(2)
    expect(device.tags.register.address).toBe('11')
    expect(device.tags.invalid.address).toBe('not-an-address')

    const outOfBounds = {
      type: 'ModbusTCP',
      tags: { first: { address: 8 }, last: { address: 65535 } },
    }
    expect(() => shiftModbusTcpAddresses(outOfBounds, 1)).toThrow('未修改任何 Tag')
    expect(outOfBounds.tags.first.address).toBe(8)
    expect(outOfBounds.tags.last.address).toBe(65535)
  })
})

describe('Tag batch domain', () => {
  it('parses delimited rows, automatic addresses, defaults, and floors', () => {
    const specs = parseTagBatchInput(
      '# skip\nTag A\nTag B\t10\nTag C, 20, Bool, 100000, note\nTag D\nTag E\t\t\t\t\tb1f',
      { startAddress: 1, defaultFloor: '4f' },
    )
    expect(specs).toEqual([
      { name: 'Tag A', address: 1, type: 'Bool', memaddress: '000000', description: null, floor: '4F' },
      { name: 'Tag B', address: 10, type: 'Bool', memaddress: '000000', description: null, floor: '4F' },
      { name: 'Tag C', address: 20, type: 'Bool', memaddress: '100000', description: 'note', floor: '4F' },
      { name: 'Tag D', address: 21, type: 'Bool', memaddress: '000000', description: null, floor: '4F' },
      { name: 'Tag E', address: 22, type: 'Bool', memaddress: '000000', description: null, floor: 'B1F' },
    ])
  })

  it('creates batch tags and detects the next address', () => {
    const device = { tags: {} as Record<string, unknown> }
    const specs = parseTagBatchInput('Tag A\nTag B\t7\tBool\t000000\t\tb1f', {
      startAddress: 1,
      defaultFloor: '4f',
    })
    const created = batchCreateTags(device, specs, new Set(), incrementingRandom(2), () => 99)
    expect(created.map((tag) => [tag.name, tag.address, tag.extra])).toEqual([
      ['Tag A', 1, { floor: '4F' }],
      ['Tag B', 7, { floor: 'B1F' }],
    ])
    const firstCreated = created[0]
    expect(firstCreated).toBeDefined()
    if (!firstCreated) throw new Error('Expected first Tag to be created')
    expect(firstCreated.timestamp).toBe(99)
    expect(getNextAvailableAddress(device)).toBe(8)
    expect(getNextAvailableAddress(device, 'another-area')).toBe(1)
  })
})
