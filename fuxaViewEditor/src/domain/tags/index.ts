import type { FuxaConfig, FuxaTag } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'
import { getTagFloor } from './floor'

export interface IndexedTag {
  id: string
  name: string
  type: string
  memaddress: string
  deviceId: string
  deviceName: string
  floor: string
  record: FuxaTag
}

export function isCoilTag(tag: IndexedTag): boolean {
  return tag.memaddress.trim() === '000000'
}

export function isAutoFilledTag(tag: IndexedTag): boolean {
  return tag.record.description === '自動補位點位'
}

export function buildTagIndex(config: FuxaConfig): Map<string, IndexedTag> {
  const index = new Map<string, IndexedTag>()
  for (const [deviceId, device] of Object.entries(config.devices)) {
    if (!isRecord(device) || !isRecord(device.tags)) continue
    const deviceName = typeof device.name === 'string' ? device.name : deviceId
    for (const [tagKey, tag] of Object.entries(device.tags)) {
      if (!isRecord(tag)) continue
      const id = typeof tag.id === 'string' ? tag.id : tagKey
      index.set(id, {
        id,
        name: typeof tag.name === 'string' ? tag.name : id,
        type: typeof tag.type === 'string' ? tag.type : '',
        memaddress: typeof tag.memaddress === 'string' ? tag.memaddress : '',
        deviceId,
        deviceName,
        floor: getTagFloor(tag),
        record: tag,
      })
    }
  }
  return index
}
