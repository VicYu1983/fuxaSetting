import type { GridSettings } from '../config/types'
import { DEFAULT_GRID } from './gridSettings'

export interface LayoutComponent {
  key: string
  template?: string
  layoutWidth?: number
  layoutHeight?: number
}

export interface ShapePlacement {
  x: number
  y: number
  width: number
  height: number
}

export interface LabelPlacement {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
}

export interface ComponentPlacement {
  key: string
  shape: ShapePlacement
  label: LabelPlacement
}

const RECT_SIZE = { width: 40, height: 40 }
const CYLINDER_SIZE = { width: 60, height: 64 }
const SWITCH_SIZE = { width: 50, height: 28 }

function positiveDimension(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

export function layoutComponents(
  components: readonly LayoutComponent[],
  settings: Partial<GridSettings>,
): ComponentPlacement[] {
  const grid = { ...DEFAULT_GRID, ...settings }
  const columns = Math.max(1, Math.floor(Number(grid.columns) || 1))
  const gapX = Math.max(0, Number(grid.gapX) || 0)
  const gapY = Math.max(0, Number(grid.gapY) || 0)
  const labelOffset = Math.max(0, Number(grid.labelOffset) || 0)
  const fontSize = Math.max(8, Number(grid.labelFontSize) || DEFAULT_GRID.labelFontSize)
  const rows = Math.ceil(components.length / columns)
  const columnWidths = Array<number>(columns).fill(0)
  const rowHeights = Array<number>(rows).fill(0)
  const sizes = components.map((component) => {
    const standard = component.template === 'cylinder'
      ? CYLINDER_SIZE
      : component.template === 'switch' ? SWITCH_SIZE : RECT_SIZE
    return {
      width: positiveDimension(component.layoutWidth, standard.width),
      height: positiveDimension(component.layoutHeight, standard.height),
    }
  })

  for (const [index, size] of sizes.entries()) {
    const column = index % columns
    const row = Math.floor(index / columns)
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, size.width)
    rowHeights[row] = Math.max(
      rowHeights[row] ?? 0,
      size.height + fontSize + labelOffset,
    )
  }

  return components.map((component, index) => {
    const size = sizes[index]
    if (!size) throw new Error(`無法計算元件 ${component.key} 的 Grid 位置。`)

    const column = index % columns
    const row = Math.floor(index / columns)
    const cellX = Number(grid.originX)
      + columnWidths.slice(0, column).reduce((sum, width) => sum + width + gapX, 0)
    const cellY = Number(grid.originY)
      + rowHeights.slice(0, row).reduce((sum, height) => sum + height + gapY, 0)
    const shape = { x: cellX, y: cellY, width: size.width, height: size.height }
    const centerX = cellX + size.width / 2
    const centerY = cellY + size.height / 2
    let label: LabelPlacement

    switch (grid.labelPosition) {
      case 'below':
        label = {
          x: centerX,
          y: cellY + size.height + labelOffset + fontSize,
          anchor: 'middle',
        }
        break
      case 'left':
        label = { x: cellX - labelOffset, y: centerY + fontSize * 0.35, anchor: 'end' }
        break
      case 'right':
        label = {
          x: cellX + size.width + labelOffset,
          y: centerY + fontSize * 0.35,
          anchor: 'start',
        }
        break
      case 'above':
      default:
        label = { x: centerX, y: cellY - labelOffset, anchor: 'middle' }
    }

    return { key: component.key, shape, label }
  })
}

export function measureSvgText(text: unknown, fontSize: number): number {
  return Array.from(String(text || '')).reduce(
    (width, character) => width + fontSize * ((character.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.6),
    0,
  )
}

export interface SvgTextBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export function getSvgTextBounds(
  text: unknown,
  x: number,
  y: number,
  anchor: LabelPlacement['anchor'],
  fontSize: number,
): SvgTextBounds {
  const width = measureSvgText(text, fontSize)
  const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
  return {
    left,
    right: left + width,
    top: y - fontSize * 0.8,
    bottom: y + fontSize * 0.2,
  }
}
