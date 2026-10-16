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

export function createTagsForDevice(
  source: FuxaConfig,
  deviceId: string,
  specs: readonly TagBatchSpec[],
  cryptoProvider: RandomValuesProvider,
): CreateTagsForDeviceResult {
  const config = structuredClone(source)
  const device = config.devices[deviceId]
  if (!isRecord(device)) throw new Error('請先選取目標設備。')

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
    ? fillModbusTcpAddressGaps(device, usedTagIds, cryptoProvider).created
    : []

  return { config, created, autoFilled }
}
