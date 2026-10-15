import type { FloorGroupFrameSettings, GridSettings } from '../config/types'
import { compareFloors, normalizeFloor } from '../tags/floor'
import type { ComponentPlacement, LayoutComponent } from './gridLayout'
import { getSvgTextBounds, layoutComponents, measureSvgText } from './gridLayout'
import { DEFAULT_GRID } from './gridSettings'
import {
  DEFAULT_FLOOR_GROUP_FRAME,
  normalizeFloorGroupFrameSettings,
} from './floorGroupFrame'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CompanionShape {
  bounds?: Bounds
}

export interface FloorLayoutComponent extends LayoutComponent {
  tagId: string
  label?: string
  seq?: number
  managed?: boolean
  originalBounds?: Bounds
  companions?: CompanionShape[]
}

export interface FloorTag {
  floor?: unknown
}

export interface FloorLayoutEntry {
  component: FloorLayoutComponent
  placement: ComponentPlacement
}

export interface FloorLayoutSection {
  floor: string
  title: string
  titleY: number
  x: number
  frame: Bounds
  entries: FloorLayoutEntry[]
}

export interface FloorLayoutResult {
  sections: FloorLayoutSection[]
  placements: FloorLayoutEntry[]
}

export interface ComponentFloorGroup {
  floor: string
  title: string
  items: FloorLayoutComponent[]
}

function tagFor(
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
  tagId: string,
): FloorTag | undefined {
  if (tags instanceof Map) return tags.get(tagId)
  return tags[tagId]
}

export function groupComponentsByFloor(
  components: readonly FloorLayoutComponent[],
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
): ComponentFloorGroup[] {
  const groups = new Map<string, FloorLayoutComponent[]>()
  for (const component of components) {
    const floor = normalizeFloor(tagFor(tags, component.tagId)?.floor)
    const entries = groups.get(floor) ?? []
    entries.push(component)
    groups.set(floor, entries)
  }

  return Array.from(groups, ([floor, items]) => ({
    floor,
    title: floor || '未設定樓層',
    items,
  })).sort((left, right) => compareFloors(left.floor, right.floor))
}

export function layoutFloorComponents(
  components: readonly FloorLayoutComponent[],
  settings: Partial<GridSettings>,
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
  frameSettings: Partial<FloorGroupFrameSettings> = DEFAULT_FLOOR_GROUP_FRAME,
): FloorLayoutResult {
  const grid = { ...DEFAULT_GRID, ...settings }
  const frame = normalizeFloorGroupFrameSettings(frameSettings)
  const sectionGap = Math.max(0, Number(grid.gapY) || 0)
  const titleFontSize = Math.max(8, Number(grid.labelFontSize) || DEFAULT_GRID.labelFontSize)
  const sections: FloorLayoutSection[] = []
  const placements: FloorLayoutEntry[] = []
  let nextTitleY = Number(grid.originY) || 0

  for (const group of groupComponentsByFloor(components, tags)) {
    const titleY = nextTitleY + titleFontSize
    const sectionGrid = {
      ...grid,
      originY: titleY + sectionGap + titleFontSize + Number(grid.labelOffset || 0),
    }
    const sectionPlacements = layoutComponents(group.items, sectionGrid)
    const entries = group.items.map((component, index) => {
      const placement = sectionPlacements[index]
      if (!placement) {
        throw new Error(`無法計算樓層「${group.title}」中元件「${component.key}」的位置。`)
      }
      return { component, placement }
    })
    const titleWidth = measureSvgText(group.title, titleFontSize)
    const bounds = {
      left: Number(grid.originX) || 0,
      top: titleY - titleFontSize * 0.8,
      right: (Number(grid.originX) || 0) + titleWidth,
      bottom: titleY + titleFontSize * 0.2,
    }

    for (const { component, placement } of entries) {
      bounds.left = Math.min(bounds.left, placement.shape.x)
      bounds.top = Math.min(bounds.top, placement.shape.y)
      bounds.right = Math.max(bounds.right, placement.shape.x + placement.shape.width)
      bounds.bottom = Math.max(bounds.bottom, placement.shape.y + placement.shape.height)

      if (component.managed === false && component.originalBounds) {
        const dx = placement.shape.x - component.originalBounds.x
        const dy = placement.shape.y - component.originalBounds.y
        for (const companion of component.companions ?? []) {
          if (!companion.bounds) continue
          bounds.left = Math.min(bounds.left, companion.bounds.x + dx)
          bounds.top = Math.min(bounds.top, companion.bounds.y + dy)
          bounds.right = Math.max(
            bounds.right,
            companion.bounds.x + dx + companion.bounds.width,
          )
          bounds.bottom = Math.max(
            bounds.bottom,
            companion.bounds.y + dy + companion.bounds.height,
          )
        }
      }

      const labelBounds = getSvgTextBounds(
        component.label,
        placement.label.x,
        placement.label.y,
        placement.label.anchor,
        titleFontSize,
      )
      bounds.left = Math.min(bounds.left, labelBounds.left)
      bounds.top = Math.min(bounds.top, labelBounds.top)
      bounds.right = Math.max(bounds.right, labelBounds.right)
      bounds.bottom = Math.max(bounds.bottom, labelBounds.bottom)
    }

    const sectionFrame: Bounds = {
      x: bounds.left - frame.padding,
      y: bounds.top - frame.padding,
      width: bounds.right - bounds.left + frame.padding * 2,
      height: bounds.bottom - bounds.top + frame.padding * 2,
    }
    sections.push({
      floor: group.floor,
      title: group.title,
      titleY,
      x: Number(grid.originX) || 0,
      frame: sectionFrame,
      entries,
    })
    placements.push(...entries)
    nextTitleY = sectionFrame.y + sectionFrame.height + sectionGap + frame.padding
  }

  return { sections, placements }
}
