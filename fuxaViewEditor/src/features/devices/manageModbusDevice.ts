import type { FuxaConfig, FuxaTag } from '../../domain/config/types'
import { isRecord } from '../../domain/config/validateFuxaConfig'
import {
  createModbusTcpDevice,
  fillModbusTcpAddressGaps,
  getModbusTcpAddressFillPlan,
  shiftModbusTcpAddresses,
  updateModbusTcpDevice,
} from '../../domain/devices/modbusTcp'
import type {
  ModbusAddressFillPlan,
  ModbusTcpDevice,
  ModbusTcpDeviceParams,
} from '../../domain/devices/modbusTcp'
import { removeDevice, syncDeviceConnectionTag } from '../../domain/devices/deviceManagement'
import { buildTagIndex } from '../../domain/tags/index'
import type { RandomValuesProvider } from '../../domain/ids'

function isModbusTcpDevice(value: unknown): value is ModbusTcpDevice {
  return isRecord(value) && value.type === 'ModbusTCP'
}

export interface ManageModbusDeviceResult {
  config: FuxaConfig
  deviceId: string
  created: boolean
  fill: ModbusAddressFillPlan & { created: FuxaTag[] }
}

export function saveModbusDevice(
  source: FuxaConfig,
  deviceId: string,
  params: ModbusTcpDeviceParams,
  cryptoProvider: RandomValuesProvider,
): ManageModbusDeviceResult {
  const config = structuredClone(source)
  const usedDeviceIds = new Set(Object.keys(config.devices))
  const usedTagIds = new Set(buildTagIndex(config).keys())
  let device: ModbusTcpDevice
  let resultDeviceId = deviceId
  const current = deviceId ? config.devices[deviceId] : undefined
  const created = !current

  if (created) {
    device = createModbusTcpDevice(params, usedDeviceIds, cryptoProvider)
    resultDeviceId = device.id ?? ''
    config.devices[resultDeviceId] = device
  } else {
    if (!isModbusTcpDevice(current)) throw new Error('找不到要修改的 ModbusTCP 設備。')
    device = current
    const candidate = {
      ...device,
      property: { ...(device.property ?? {}), addressCount: params.addressCount },
    }
    getModbusTcpAddressFillPlan(candidate)
    updateModbusTcpDevice(device, params)
  }

  if (!resultDeviceId) throw new Error('建立設備時未產生有效 ID。')
  if (typeof device.name !== 'string') throw new Error('設備名稱不可空白。')
  syncDeviceConnectionTag(config, resultDeviceId, device.name, cryptoProvider, usedTagIds)
  const fill = fillModbusTcpAddressGaps(device, usedTagIds, cryptoProvider)
  return { config, deviceId: resultDeviceId, created, fill }
}

export function shiftModbusDeviceTags(
  source: FuxaConfig,
  deviceId: string,
  delta: number,
): { config: FuxaConfig; count: number; skippedInvalid: number } {
  const config = structuredClone(source)
  const device = config.devices[deviceId]
  if (!isModbusTcpDevice(device)) throw new Error('找不到要調整的 ModbusTCP 設備。')
  const result = shiftModbusTcpAddresses(device, delta)
  return { config, ...result }
}

export function previewModbusAddressFill(
  config: FuxaConfig,
  deviceId: string,
): ModbusAddressFillPlan {
  const device = config.devices[deviceId]
  if (!isModbusTcpDevice(device)) throw new Error('找不到要補位的 ModbusTCP 設備。')
  return getModbusTcpAddressFillPlan(device)
}

export function fillModbusDeviceAddressGaps(
  source: FuxaConfig,
  deviceId: string,
  cryptoProvider: RandomValuesProvider,
): ManageModbusDeviceResult {
  const config = structuredClone(source)
  const device = config.devices[deviceId]
  if (!isModbusTcpDevice(device)) throw new Error('找不到要補位的 ModbusTCP 設備。')
  const usedTagIds = new Set(buildTagIndex(config).keys())
  const fill = fillModbusTcpAddressGaps(device, usedTagIds, cryptoProvider)
  return { config, deviceId, created: false, fill }
}

export function deleteManagedDevice(source: FuxaConfig, deviceId: string): FuxaConfig {
  const config = structuredClone(source)
  if (!removeDevice(config, deviceId)) throw new Error('找不到要刪除的設備。')
  return config
}
