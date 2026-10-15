import type { FuxaConfig } from '../../domain/config/types'
import { isRecord } from '../../domain/config/validateFuxaConfig'
import { normalizeFloor, setTagFloor } from '../../domain/tags/floor'
import { buildTagIndex } from '../../domain/tags/index'

export interface ApplyTagFloorsResult {
  config: FuxaConfig
  changedCount: number
}

export function applyTagFloors(
  source: FuxaConfig,
  tagIds: readonly string[],
  value: unknown,
): ApplyTagFloorsResult {
  const config = structuredClone(source)
  const index = buildTagIndex(config)
  const normalizedValue = normalizeFloor(value)
  const changedTags = tagIds.flatMap((id) => {
    const indexed = index.get(id)
    if (!indexed) return []
    const tag = indexed.record
    const extra = isRecord(tag.extra) ? tag.extra : undefined
    const hasStoredFloor = Boolean(extra && Object.hasOwn(extra, 'floor'))
    const storedFloor = hasStoredFloor ? extra?.floor : undefined
    if (indexed.floor === normalizedValue && (
      normalizedValue ? storedFloor === normalizedValue : !hasStoredFloor
    )) return []
    return [tag]
  })
  for (const tag of changedTags) setTagFloor(tag, value)
  return { config, changedCount: changedTags.length }
}
