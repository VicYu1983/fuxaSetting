import { normalizeFloor } from './floor'
import { generateId, type RandomValuesProvider } from '../ids'
import { isRecord } from '../config/validateFuxaConfig'

export interface TagBatchOptions {
  defaultMemAddress?: string
  defaultType?: string
  defaultFloor?: unknown
  startAddress?: number
  step?: number
}

export interface TagBatchSpec {
  name: string
  address: number
  type: string
  memaddress: string
  description: string | null
  floor: string
  divisor?: unknown
  daq?: Record<string, unknown>
}

export interface CreatedTag extends Record<string, unknown> {
  id: string
  name: string
  type: string
  memaddress: string
  address: number
  timestamp: number
}

export interface TagDevice extends Record<string, unknown> {
  tags?: Record<string, unknown>
}

export function parseTagBatchInput(inputText: unknown, options: TagBatchOptions = {}): TagBatchSpec[] {
  const defaultMemAddress = typeof options.defaultMemAddress === 'string'
    ? options.defaultMemAddress
    : '000000'
  const defaultType = typeof options.defaultType === 'string' ? options.defaultType : 'Bool'
  const defaultFloor = normalizeFloor(options.defaultFloor)
  const step = Math.max(1, Math.floor(Number(options.step) || 1))
  let nextAutoAddress = Math.max(0, Math.floor(Number(options.startAddress) || 1))
  const lines = String(inputText || '').split(/\r?\n/)
  const results: TagBatchSpec[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    const delimiter = line.includes('\t') ? '\t' : ','
    const parts = line.split(delimiter).map((part) => part.trim())
    const name = parts[0]
    if (!name) continue

    let address: number
    const addressInput = parts[1]
    if (addressInput && !Number.isNaN(Number(addressInput))) {
      address = Math.floor(Number(addressInput))
      nextAutoAddress = address + step
    } else {
      address = nextAutoAddress
      nextAutoAddress += step
    }

    const type = parts[2] || defaultType
    const memaddress = parts[3] || defaultMemAddress
    const description = parts[4] || null
    const floor = normalizeFloor(parts[5] || defaultFloor)
    results.push({ name, address, type, memaddress, description, floor })
  }

  return results
}

export function getNextAvailableAddress(device: unknown, memaddress?: string): number {
  if (!isRecord(device) || !isRecord(device.tags)) return 1
  let max = 0
  for (const tag of Object.values(device.tags)) {
    if (!isRecord(tag)) continue
    if (memaddress !== undefined && tag.memaddress !== memaddress) continue
    const address = Number(tag.address)
    if (Number.isFinite(address) && address > max) max = address
  }
  return max + 1
}

export function batchCreateTags(
  device: TagDevice,
  tagSpecs: readonly TagBatchSpec[],
  usedTagIds: Set<string>,
  cryptoProvider: RandomValuesProvider,
  now = Date.now,
): CreatedTag[] {
  if (!isRecord(device)) throw new Error('無效的設備。')
  if (!isRecord(device.tags)) device.tags = {}
  const created: CreatedTag[] = []
  const timestamp = now()
  for (const spec of tagSpecs) {
    const id = generateId('t', usedTagIds, cryptoProvider)
    const tag: CreatedTag = {
      id,
      name: String(spec.name).trim(),
      type: spec.type ? String(spec.type).trim() : 'Bool',
      memaddress: spec.memaddress ? String(spec.memaddress).trim() : '000000',
      address: Number(spec.address),
      divisor: spec.divisor !== undefined ? spec.divisor : null,
      daq: {
        enabled: Boolean(spec.daq?.enabled),
        interval: Number(spec.daq?.interval) || 60,
        changed: Boolean(spec.daq?.changed),
        restored: Boolean(spec.daq?.restored),
      },
      description: spec.description !== undefined ? spec.description : null,
      timestamp,
    }
    const floor = normalizeFloor(spec.floor)
    if (floor) tag.extra = { floor }
    device.tags[id] = tag
    created.push(tag)
  }
  return created
}
