import type { FuxaConfig } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'

type TagEntry<T> = readonly [string, T]

function numericAddress(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined
  const address = value.address
  if (typeof address === 'number') return Number.isFinite(address) ? address : undefined
  if (typeof address !== 'string' || !address.trim()) return undefined
  const parsed = Number(address)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function sortTagEntriesByAddress<T>(entries: readonly TagEntry<T>[]): [string, T][] {
  return entries
    .map((entry, index) => ({ entry, index, address: numericAddress(entry[1]) }))
    .sort((left, right) => {
      if (left.address === undefined) return right.address === undefined ? left.index - right.index : 1
      if (right.address === undefined) return -1
      return left.address - right.address || left.index - right.index
    })
    .map(({ entry }) => [entry[0], entry[1]])
}

export function deviceTagsNeedAddressSorting(config: FuxaConfig): boolean {
  for (const device of Object.values(config.devices)) {
    if (!isRecord(device) || !isRecord(device.tags)) continue
    const entries = Object.entries(device.tags)
    const sorted = sortTagEntriesByAddress(entries)
    if (entries.some(([id], index) => id !== sorted[index]?.[0])) return true
  }
  return false
}

export function sortDeviceTagsByAddress(config: FuxaConfig): void {
  for (const device of Object.values(config.devices)) {
    if (!isRecord(device) || !isRecord(device.tags)) continue
    device.tags = Object.fromEntries(sortTagEntriesByAddress(Object.entries(device.tags)))
  }
}
