import { isRecord } from '../config/validateFuxaConfig'
import type { FuxaTag } from '../config/types'
import { generateId, type RandomValuesProvider } from '../ids'
import { AUTO_FILLED_TAG_DESCRIPTION } from '../tags'

export interface ModbusTcpDevice extends Record<string, unknown> {
  id?: string
  name?: string
  type?: string
  enabled?: boolean
  polling?: number
  property?: Record<string, unknown>
  tags?: Record<string, FuxaTag>
}

export interface ModbusTcpDeviceParams extends Record<string, unknown> {
  name?: unknown
  addressCount?: unknown
}

interface AddressedTag extends FuxaTag {
  address: number | string
  memaddress: string
}

export interface ModbusAddressFillPlan {
  count: number
  missing: number[]
  hasAnchor: boolean
  startAddress?: number
  endAddress?: number
  memaddress?: string
  template?: AddressedTag
}

export interface ModbusAddressShiftPlan {
  count: number
  skippedInvalid: number
  updates: Array<{ tag: FuxaTag; nextAddress: number }>
}

export function normalizeModbusTcpAddressCount(value: unknown): number {
  const count = value === undefined || value === null || value === '' ? 0 : Number(value)
  if (!Number.isSafeInteger(count) || count < 0 || count > 65536) {
    throw new Error('地址數量必須是 0 到 65536 之間的整數。')
  }
  return count
}

export function createModbusTcpDevice(
  params: ModbusTcpDeviceParams,
  usedDeviceIds: Set<string>,
  cryptoProvider: RandomValuesProvider,
): ModbusTcpDevice {
  const name = typeof params.name === 'string' ? params.name.trim() : ''
  if (!name) throw new Error('設備名稱不可空白。')
  const addressCount = normalizeModbusTcpAddressCount(params.addressCount)
  const id = generateId('d', usedDeviceIds, cryptoProvider)
  const property: Record<string, unknown> = {
    address: params.address ? String(params.address).trim() : '127.0.0.1:502',
    port: null,
    slot: null,
    rack: null,
    slaveid: params.slaveid !== undefined ? String(params.slaveid).trim() : '1',
    baudrate: Number(params.baudrate) || 9600,
    databits: Number(params.databits) || 8,
    stopbits: Number(params.stopbits) || 1,
    parity: params.parity ? String(params.parity) : 'None',
    connectionOption: params.connectionOption ? String(params.connectionOption) : 'TcpPort',
    delay: params.delay !== undefined ? Number(params.delay) : 10,
    forceFC16: Boolean(params.forceFC16),
    timeout: params.timeout !== undefined ? Number(params.timeout) : 2000,
    addressCount,
  }
  return {
    id,
    name,
    enabled: params.enabled !== undefined ? Boolean(params.enabled) : true,
    property,
    type: 'ModbusTCP',
    polling: Number(params.polling) || 200,
    tags: {},
  }
}

export function updateModbusTcpDevice(
  device: ModbusTcpDevice,
  params: ModbusTcpDeviceParams,
): ModbusTcpDevice {
  if (!isRecord(device)) throw new Error('無效的設備資料。')
  if (!isRecord(device.property)) device.property = {}
  const property = device.property
  if (params.addressCount !== undefined) {
    property.addressCount = normalizeModbusTcpAddressCount(params.addressCount)
  }
  if (params.name !== undefined) {
    const name = String(params.name).trim()
    if (!name) throw new Error('設備名稱不可空白。')
    device.name = name
  }
  if (params.enabled !== undefined) device.enabled = Boolean(params.enabled)
  if (params.polling !== undefined) device.polling = Number(params.polling) || 200
  if (params.address !== undefined) property.address = String(params.address).trim()
  if (params.slaveid !== undefined) property.slaveid = String(params.slaveid).trim()
  if (params.baudrate !== undefined) property.baudrate = Number(params.baudrate) || 9600
  if (params.databits !== undefined) property.databits = Number(params.databits) || 8
  if (params.stopbits !== undefined) property.stopbits = Number(params.stopbits) || 1
  if (params.parity !== undefined) property.parity = String(params.parity)
  if (params.connectionOption !== undefined) property.connectionOption = String(params.connectionOption)
  if (params.delay !== undefined) property.delay = Number(params.delay)
  if (params.forceFC16 !== undefined) property.forceFC16 = Boolean(params.forceFC16)
  if (params.timeout !== undefined) property.timeout = Number(params.timeout)
  return device
}

export function getModbusTcpAddressFillPlan(device: unknown): ModbusAddressFillPlan {
  if (!isRecord(device)) throw new Error('無效的設備。')
  const property = isRecord(device.property) ? device.property : undefined
  const count = normalizeModbusTcpAddressCount(property?.addressCount)
  if (count === 0) return { count, missing: [], hasAnchor: false }

  const tags = isRecord(device.tags) ? Object.values(device.tags) : []
  const addressedTags = tags.filter((tag): tag is AddressedTag =>
    isRecord(tag) && Number.isSafeInteger(Number(tag.address)) &&
    tag.address !== undefined && tag.address !== null && tag.address !== '' &&
    Number(tag.address) >= 0 && typeof tag.memaddress === 'string',
  )
  if (addressedTags.length === 0) return { count, missing: [], hasAnchor: false }

  const template = addressedTags.reduce((first, tag) =>
    Number(tag.address) < Number(first.address) ? tag : first)
  const startAddress = Number(template.address)
  const endAddress = startAddress + count - 1
  if (endAddress > 65535) {
    throw new Error(
      `地址數量 ${count} 超出 Modbus 位址範圍；起始位址 ${startAddress} 的最大可用數量為 ${65536 - startAddress}。`,
    )
  }

  const occupied = new Set(addressedTags
    .filter((tag) => tag.memaddress === template.memaddress)
    .map((tag) => Number(tag.address)))
  const missing: number[] = []
  for (let address = startAddress; address <= endAddress; address += 1) {
    if (!occupied.has(address)) missing.push(address)
  }
  return {
    count,
    hasAnchor: true,
    startAddress,
    endAddress,
    memaddress: template.memaddress,
    template,
    missing,
  }
}

export function getModbusTcpAddressShiftPlan(
  device: unknown,
  delta: number,
): ModbusAddressShiftPlan {
  if (!isRecord(device) || device.type !== 'ModbusTCP') {
    throw new Error('無效的 ModbusTCP 設備。')
  }
  if (delta !== 1 && delta !== -1) throw new Error('位址調整量只能是 +1 或 -1。')
  const tags = isRecord(device.tags) ? Object.values(device.tags) : []
  const updates: ModbusAddressShiftPlan['updates'] = []
  let skippedInvalid = 0
  for (const tag of tags) {
    if (!isRecord(tag) || tag.address === undefined || tag.address === null || tag.address === '') {
      continue
    }
    const address = Number(tag.address)
    if (!Number.isSafeInteger(address) || address < 0 || address > 65535) {
      skippedInvalid += 1
      continue
    }
    const nextAddress = address + delta
    if (nextAddress < 0 || nextAddress > 65535) {
      throw new Error(
        `無法將本站所有 Tag address ${delta > 0 ? '+1' : '-1'}：位址 ${address} 超出 Modbus 位址範圍 0–65535。未修改任何 Tag。`,
      )
    }
    updates.push({ tag, nextAddress })
  }
  return { count: updates.length, skippedInvalid, updates }
}

export function shiftModbusTcpAddresses(
  device: unknown,
  delta: number,
): Omit<ModbusAddressShiftPlan, 'updates'> {
  if (!isRecord(device)) throw new Error('無效的 ModbusTCP 設備。')
  const plan = getModbusTcpAddressShiftPlan(device, delta)
  for (const { tag, nextAddress } of plan.updates) {
    tag.address = typeof tag.address === 'string' ? String(nextAddress) : nextAddress
  }
  return { count: plan.count, skippedInvalid: plan.skippedInvalid }
}

export function fillModbusTcpAddressGaps(
  device: ModbusTcpDevice,
  usedTagIds: Set<string>,
  cryptoProvider: RandomValuesProvider,
  now = Date.now,
  reservedNames: Iterable<string> = [],
): ModbusAddressFillPlan & { created: FuxaTag[] } {
  const plan = getModbusTcpAddressFillPlan(device)
  if (!plan.hasAnchor || plan.missing.length === 0) return { ...plan, created: [] }
  if (!isRecord(device.tags)) device.tags = {}
  const tags = device.tags
  const existingNames = new Set(Object.values(tags)
    .filter(isRecord)
    .map((tag) => String(tag.name || '').toLocaleLowerCase()))
  for (const name of reservedNames) existingNames.add(name.trim().toLocaleLowerCase())
  const template = plan.template
  if (!template) throw new Error('Modbus 位址補位缺少可複製的 Tag 範本。')
  const created: FuxaTag[] = []
  for (const address of plan.missing) {
    let name = `補位_${address}`
    let suffix = 2
    while (existingNames.has(name.toLocaleLowerCase())) {
      name = `補位_${address} (${suffix})`
      suffix += 1
    }
    existingNames.add(name.toLocaleLowerCase())
    const id = generateId('t', usedTagIds, cryptoProvider)
    const tag: FuxaTag = {
      ...structuredClone(template),
      id,
      name,
      address,
      description: AUTO_FILLED_TAG_DESCRIPTION,
      timestamp: now(),
    }
    tags[id] = tag
    created.push(tag)
  }
  return { ...plan, created }
}
