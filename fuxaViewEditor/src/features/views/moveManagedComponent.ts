import { normalizeFloor } from '../../domain/tags/floor'
import type { FloorLayoutComponent, FloorTag } from '../../domain/layout/floorLayout'

export type ComponentMoveDirection = -1 | 1

function floorFor(
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
  tagId: string,
): string {
  const tag = tags instanceof Map ? tags.get(tagId) : tags[tagId]
  return normalizeFloor(tag?.floor)
}

export function moveManagedComponent<T extends FloorLayoutComponent>(
  components: readonly T[],
  key: string,
  direction: ComponentMoveDirection,
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
): T[] {
  const next = [...components]
  const sourceIndex = next.findIndex((component) =>
    component.key === key && component.managed !== false)
  if (sourceIndex < 0) return next

  const source = next[sourceIndex]
  if (!source) return next
  const sourceFloor = floorFor(tags, source.tagId)
  const targetIndex = next.findIndex((component, index) => (
    index !== sourceIndex
    && component.managed !== false
    && floorFor(tags, component.tagId) === sourceFloor
    && (direction < 0 ? index < sourceIndex : index > sourceIndex)
    && !next.slice(
      direction < 0 ? index + 1 : sourceIndex + 1,
      direction < 0 ? sourceIndex : index,
    ).some((between) => (
      between.managed !== false && floorFor(tags, between.tagId) === sourceFloor
    ))
  ))
  if (targetIndex < 0) return next

  const target = next[targetIndex]
  if (!target) return next
  next[sourceIndex] = target
  next[targetIndex] = source
  return next
}
