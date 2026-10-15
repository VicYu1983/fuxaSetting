import { describe, expect, it } from 'vitest'
import { removeDevice, syncDeviceConnectionTag } from '../../src/domain/devices/deviceManagement'
import type { RandomValuesProvider } from '../../src/domain/ids'

const fixedRandom: RandomValuesProvider = {
  getRandomValues(bytes) {
    bytes.fill(9)
    return bytes
  },
}

describe('Device management', () => {
  it('creates then updates the FuxaServer connection Tag', () => {
    const config = {
      devices: {
        '0': { id: '0', name: 'FUXA', type: 'FuxaServer', tags: {} as Record<string, unknown> },
        d_demo: { id: 'd_demo', name: 'DemoDev', tags: {} },
      },
    }
    const usedTagIds = new Set<string>()
    const tag = syncDeviceConnectionTag(config, 'd_demo', 'DemoDev', fixedRandom, usedTagIds, () => 101)

    expect(tag).toMatchObject({
      id: 't_09090909-09090909',
      name: 'DemoDev Connection Status',
      label: 'DemoDev Connection Status',
      type: 'number',
      memaddress: 'd_demo',
      sysType: 1,
      timestamp: 101,
      daq: { enabled: false, interval: 60, changed: false, restored: false },
    })
    expect(Object.keys(config.devices['0'].tags)).toEqual(['t_09090909-09090909'])

    const updated = syncDeviceConnectionTag(
      config,
      'd_demo',
      'DemoDev-Renamed',
      fixedRandom,
      usedTagIds,
      () => 202,
    )
    expect(updated).toBe(tag)
    expect(updated).toMatchObject({
      name: 'DemoDev-Renamed Connection Status',
      label: 'DemoDev-Renamed Connection Status',
      timestamp: 202,
    })
    expect(Object.keys(config.devices['0'].tags)).toHaveLength(1)
  })

  it('returns null when FuxaServer is absent or malformed', () => {
    expect(syncDeviceConnectionTag({}, 'd_demo', 'DemoDev', fixedRandom, new Set()))
      .toBeNull()
    expect(syncDeviceConnectionTag({ devices: { '0': null } }, 'd_demo', 'DemoDev', fixedRandom, new Set()))
      .toBeNull()
  })

  it('removes the device and only its connection-status tags', () => {
    const config = {
      devices: {
        '0': {
          id: '0',
          tags: {
            connected: { memaddress: 'd_demo', sysType: 1 },
            unrelated: { memaddress: 'd_other', sysType: 1 },
            ordinary: { memaddress: 'd_demo', sysType: 2 },
          },
        },
        d_demo: { id: 'd_demo' },
      },
    }

    expect(removeDevice(config, 'd_demo')).toBe(true)
    expect(config.devices.d_demo).toBeUndefined()
    expect(config.devices['0'].tags).toEqual({
      unrelated: { memaddress: 'd_other', sysType: 1 },
      ordinary: { memaddress: 'd_demo', sysType: 2 },
    })
    expect(removeDevice(config, 'd_demo')).toBe(false)
    expect(removeDevice({}, 'd_demo')).toBe(false)
  })
})
