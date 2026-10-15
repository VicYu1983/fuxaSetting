import { isRecord } from '../config/validateFuxaConfig'
import type { FuxaTag } from '../config/types'

export function normalizeFloor(value: unknown): string {
  const floor = typeof value === 'string' ? value.trim() : ''
  if (!floor) return ''

  const basement = floor.match(/^b\s*(\d+)\s*f?$/i)
  if (basement) return `B${Number(basement[1])}F`

  const aboveGround = floor.match(/^(\d+)\s*f$/i)
  if (aboveGround) return `${Number(aboveGround[1])}F`

  return floor
}

export function getTagFloor(tag: unknown): string {
  return isRecord(tag) && isRecord(tag.extra)
    ? normalizeFloor(tag.extra.floor)
    : ''
}

export function setTagFloor(tag: FuxaTag, value: unknown): string {
  if (!isRecord(tag)) throw new Error('無效的 Tag 資料。')

  const floor = normalizeFloor(value)
  const extra = isRecord(tag.extra) ? tag.extra : {}
  if (floor) extra.floor = floor
  else delete extra.floor

  if (Object.keys(extra).length > 0) tag.extra = extra
  else delete tag.extra

  return floor
}

function floorRank(value: string): { category: number; value: number | string } {
  const basement = value.match(/^B(\d+)F$/)
  if (basement) return { category: 0, value: -Number(basement[1]) }

  const level = value.match(/^(\d+)F$/)
  if (level) return { category: 1, value: Number(level[1]) }

  if (/^(屋頂|RF|ROOF)$/i.test(value)) return { category: 2, value: 0 }
  return { category: 3, value: value.toLocaleLowerCase() }
}

export function compareFloors(left: unknown, right: unknown): number {
  const a = normalizeFloor(left)
  const b = normalizeFloor(right)
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1

  const rankA = floorRank(a)
  const rankB = floorRank(b)
  if (rankA.category !== rankB.category) return rankA.category - rankB.category
  if (rankA.value < rankB.value) return -1
  if (rankA.value > rankB.value) return 1
  return a.localeCompare(b, 'zh-Hant')
}

export interface FloorGroup<T> {
  floor: string
  title: string
  items: T[]
}

export function groupByFloor<T>(
  items: readonly T[],
  getFloor: (item: T) => unknown,
): FloorGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const floor = normalizeFloor(getFloor(item))
    const entries = groups.get(floor) ?? []
    entries.push(item)
    groups.set(floor, entries)
  }

  return Array.from(groups, ([floor, groupedItems]) => ({
    floor,
    title: floor || '未設定樓層',
    items: groupedItems,
  })).sort((a, b) => compareFloors(a.floor, b.floor))
}
