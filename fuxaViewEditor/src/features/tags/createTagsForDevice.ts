import type { FuxaConfig, FuxaTag } from '../../domain/config/types'
import { isRecord } from '../../domain/config/validateFuxaConfig'
import {
  fillModbusTcpAddressGaps,
  getModbusTcpAddressFillPlan,
} from '../../domain/devices/modbusTcp'
import type { ModbusTcpDevice } from '../../domain/devices/modbusTcp'
import type { RandomValuesProvider } from '../../domain/ids'
import { batchCreateTags } from '../../domain/tags/batch'
import type { TagBatchSpec } from '../../domain/tags/batch'
import { buildTagIndex } from '../../domain/tags/index'

function isModbusTcpDevice(value: Record<string, unknown>): value is ModbusTcpDevice {
  return value.type === 'ModbusTCP'
}

export interface CreateTagsForDeviceResult {
  config: FuxaConfig
  created: FuxaTag[]
  autoFilled: FuxaTag[]
}

function normalizeTagName(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLocaleLowerCase() : ''
}

export function createTagsForDevice(
  source: FuxaConfig,
  deviceId: string,
  specs: readonly TagBatchSpec[],
  cryptoProvider: RandomValuesProvider,
): CreateTagsForDeviceResult {
  const config = structuredClone(source)
  const device = config.devices[deviceId]
  if (!isRecord(device)) throw new Error('請先選取目標設備。')

  const usedNames = new Set<string>()
  for (const candidate of Object.values(config.devices)) {
    if (!isRecord(candidate) || !isRecord(candidate.tags)) continue
    for (const tag of Object.values(candidate.tags)) {
      if (!isRecord(tag)) continue
      const name = normalizeTagName(tag.name)
      if (name) usedNames.add(name)
    }
  }
  for (const spec of specs) {
    const name = normalizeTagName(spec.name)
    if (!name) throw new Error('Tag 名稱不可空白。')
    if (usedNames.has(name)) {
      throw new Error(`Tag 名稱「${spec.name.trim()}」已存在，請修改名稱後再建立。`)
    }
    usedNames.add(name)
  }

  if (isModbusTcpDevice(device)) {
    const currentTags = isRecord(device.tags) ? device.tags : {}
    const candidateTags = { ...currentTags }
    for (const [index, spec] of specs.entries()) {
      candidateTags[`pending-${index}`] = {
        address: spec.address,
        memaddress: spec.memaddress,
      }
    }
    getModbusTcpAddressFillPlan({ ...device, tags: candidateTags })
  }

  const usedTagIds = new Set(buildTagIndex(config).keys())
  const created = batchCreateTags(device, specs, usedTagIds, cryptoProvider)
  const autoFilled = isModbusTcpDevice(device)
    ? fillModbusTcpAddressGaps(device, usedTagIds, cryptoProvider, undefined, usedNames).created
    : []

  return { config, created, autoFilled }
}
