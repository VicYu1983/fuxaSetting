import type { FuxaTag } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'
import { generateId, type RandomValuesProvider } from '../ids'

export function syncDeviceConnectionTag(
  config: unknown,
  deviceId: string,
  deviceName: string,
  cryptoProvider: RandomValuesProvider,
  usedTagIds: Set<string>,
  now = Date.now,
): FuxaTag | null {
  if (!isRecord(config) || !isRecord(config.devices) || !isRecord(config.devices['0'])) {
    return null
  }

  const serverDevice = config.devices['0']
  const tags = isRecord(serverDevice.tags) ? serverDevice.tags : {}
  serverDevice.tags = tags
  const connectionName = `${deviceName} Connection Status`

  for (const tag of Object.values(tags)) {
    if (isRecord(tag) && tag.memaddress === deviceId && tag.sysType === 1) {
      tag.name = connectionName
      tag.label = connectionName
      tag.timestamp = now()
      return tag
    }
  }

  const tagId = generateId('t', usedTagIds, cryptoProvider)
  const connectionTag: FuxaTag = {
    id: tagId,
    name: connectionName,
    label: connectionName,
    type: 'number',
    memaddress: deviceId,
    daq: {
      enabled: false,
      interval: 60,
      changed: false,
      restored: false,
    },
    init: '',
    sysType: 1,
    timestamp: now(),
  }
  tags[tagId] = connectionTag
  return connectionTag
}

export function removeDevice(config: unknown, deviceId: string): boolean {
  if (!isRecord(config) || !isRecord(config.devices) || !config.devices[deviceId]) {
    return false
  }

  const devices = config.devices
  delete devices[deviceId]
  const serverDevice = devices['0']
  if (isRecord(serverDevice)) {
    const tags = serverDevice.tags
    if (!isRecord(tags)) return true
    for (const [tagId, tag] of Object.entries(tags)) {
      if (isRecord(tag) && tag.memaddress === deviceId && tag.sysType === 1) {
        delete tags[tagId]
      }
    }
  }
  return true
}
