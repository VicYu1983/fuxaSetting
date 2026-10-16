import type { FuxaConfig, FuxaTag } from '../../domain/config/types'
import { isRecord } from '../../domain/config/validateFuxaConfig'
import { setTagFloor } from '../../domain/tags/floor'

export interface DeviceTagUpdate {
  name: string
  address?: number | null
  type: string
  memaddress: string
  description: string
  floor: string
}

function getModbusTag(
  config: FuxaConfig,
  deviceId: string,
  tagId: string,
): { device: Record<string, unknown>; tags: Record<string, unknown>; tag: FuxaTag } {
  const device = config.devices[deviceId]
  if (!isRecord(device) || device.type !== 'ModbusTCP' || !isRecord(device.tags)) {
    throw new Error('找不到所選的 ModbusTCP 設備或其 Tag 清單。')
  }
  const tags = device.tags
  const entry = Object.entries(tags).find(([key, value]) => (
    key === tagId || (isRecord(value) && value.id === tagId)
  ))
  if (!entry || !isRecord(entry[1])) throw new Error('找不到要操作的 Tag。')
  return { device, tags, tag: entry[1] }
}

export function updateModbusDeviceTag(
  source: FuxaConfig,
  deviceId: string,
  tagId: string,
  update: DeviceTagUpdate,
  now = Date.now,
): FuxaConfig {
  const config = structuredClone(source)
  const { tag } = getModbusTag(config, deviceId, tagId)
  const name = update.name.trim()
  const type = update.type.trim()
  const memaddress = update.memaddress.trim()
  if (!name) throw new Error('Tag 名稱不可空白。')
  if (!type) throw new Error('Tag 型別不可空白。')
  if (!memaddress) throw new Error('記憶體區段不可空白。')
  if (update.address !== undefined && update.address !== null
      && (!Number.isSafeInteger(update.address) || update.address < 0 || update.address > 65535)) {
    throw new Error('Tag 位址必須是 0 到 65535 之間的整數。')
  }

  tag.name = name
  tag.type = type
  tag.memaddress = memaddress
  if (update.address === null) delete tag.address
  else if (update.address !== undefined) tag.address = update.address
  tag.description = update.description.trim() || null
  setTagFloor(tag, update.floor)
  tag.timestamp = now()
  return config
}

export function deleteModbusDeviceTag(
  source: FuxaConfig,
  deviceId: string,
  tagId: string,
): FuxaConfig {
  const config = structuredClone(source)
  const { tags, tag } = getModbusTag(config, deviceId, tagId)
  const entry = Object.entries(tags).find(([key, value]) => (
    key === tagId || (isRecord(value) && value.id === tagId)
  ))
  if (!entry || entry[1] !== tag) throw new Error('找不到要刪除的 Tag。')
  delete tags[entry[0]]
  return config
}
