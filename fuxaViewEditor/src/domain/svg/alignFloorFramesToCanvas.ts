import type { FuxaConfig } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'
import { getCanvasWidth } from '../layout/floorLayout'
import { findSvgElementById, parseSvg } from './parseSvg'
import type { SvgParserConstructor } from './parseSvg'

const FLOOR_FRAME_NAME = 'fuxa_floor_section_frame'
const ATTRIBUTE_TOLERANCE = 0.000001

function frameIds(view: Record<string, unknown>): string[] {
  if (!isRecord(view.items)) return []
  return Object.entries(view.items)
    .filter(([, item]) => isRecord(item) && item.name === FLOOR_FRAME_NAME)
    .map(([id]) => id)
}

function frameRectangle(
  view: Record<string, unknown>,
  doc: XMLDocument,
  frameId: string,
): Element {
  const frameNode = findSvgElementById(doc, frameId)
  if (!frameNode) {
    throw new Error(`樓層底框「${frameId}」在 SVG 中不存在。`)
  }
  if (frameNode.localName === 'rect') return frameNode
  const rectangles = Array.from(frameNode.getElementsByTagName('rect'))
  if (rectangles.length !== 1) {
    const name = typeof view.name === 'string' && view.name ? view.name : String(view.id || '未知 View')
    throw new Error(`View「${name}」的樓層底框「${frameId}」必須包含一個矩形。`)
  }
  return rectangles[0]!
}

function matchesAttribute(node: Element, attribute: string, expected: number): boolean {
  const value = Number(node.getAttribute(attribute))
  return Number.isFinite(value) && Math.abs(value - expected) <= ATTRIBUTE_TOLERANCE
}

function visitFloorFrameRectangles(
  config: FuxaConfig,
  Parser: SvgParserConstructor,
  visit: (view: Record<string, unknown>, rectangle: Element, x: number, width: number) => void,
  serialize?: (doc: XMLDocument) => string,
): void {
  for (const view of config.hmi.views) {
    if (!isRecord(view)) continue
    const ids = frameIds(view)
    if (ids.length === 0) continue
    if (typeof view.svgcontent !== 'string') {
      const name = typeof view.name === 'string' && view.name ? view.name : String(view.id || '未知 View')
      throw new Error(`View「${name}」缺少 SVG 內容，無法對齊樓層底框。`)
    }
    let doc: XMLDocument
    try {
      doc = parseSvg(view.svgcontent, Parser)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const name = typeof view.name === 'string' && view.name ? view.name : String(view.id || '未知 View')
      throw new Error(`無法讀取 View「${name}」的樓層底框：${detail}`, { cause: error })
    }
    const canvasWidth = getCanvasWidth(view.profile)
    const inset = Math.min(10, canvasWidth / 2)
    const width = Math.max(0, canvasWidth - inset * 2)
    let changed = false
    for (const id of ids) {
      const rectangle = frameRectangle(view, doc, id)
      if (!matchesAttribute(rectangle, 'x', inset) || !matchesAttribute(rectangle, 'width', width)) {
        changed = true
        visit(view, rectangle, inset, width)
      }
    }
    if (changed && serialize) view.svgcontent = serialize(doc)
  }
}

function alignOneFrame(_view: Record<string, unknown>, rectangle: Element, x: number, width: number): void {
  rectangle.setAttribute('x', String(x))
  rectangle.setAttribute('width', String(width))
}

export function floorFramesNeedCanvasAlignment(
  config: FuxaConfig,
  Parser: SvgParserConstructor,
): boolean {
  let needsAlignment = false
  visitFloorFrameRectangles(config, Parser, (_view, rectangle, x, width) => {
    if (!matchesAttribute(rectangle, 'x', x) || !matchesAttribute(rectangle, 'width', width)) {
      needsAlignment = true
    }
  })
  return needsAlignment
}

export function alignFloorFramesToCanvas(
  config: FuxaConfig,
  Parser: SvgParserConstructor,
  serialize: (doc: XMLDocument) => string,
): void {
  visitFloorFrameRectangles(config, Parser, alignOneFrame, serialize)
}
