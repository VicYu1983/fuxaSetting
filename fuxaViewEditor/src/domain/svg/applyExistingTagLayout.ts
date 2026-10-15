import type { ComponentPlacement } from '../layout/gridLayout'
import { findSvgElementById } from './parseSvg'
import { existingTagTransform } from './existingTagTransform'
import type { TagPosition } from './existingTagTransform'

const FLOOR_LAYOUT_MARKER = 'floor-layout-v1'

export interface ExistingTagLayoutComponent {
  shapeId: string
  originalBounds: TagPosition
  companions?: readonly { id: string }[]
}

function setLayoutTransform(node: Element, transform: string): void {
  if (transform) {
    node.setAttribute('transform', transform)
    node.setAttribute('data-fuxa-floor-layout', FLOOR_LAYOUT_MARKER)
  } else {
    node.removeAttribute('transform')
    node.removeAttribute('data-fuxa-floor-layout')
  }
}

export function applyExistingTagLayout(
  doc: XMLDocument,
  component: ExistingTagLayoutComponent,
  placement: ComponentPlacement,
): void {
  const node = findSvgElementById(doc, component.shapeId)
  if (!node) throw new Error(`既有 Tag 元件 ${component.shapeId} 在 SVG 中不存在。`)

  const transform = existingTagTransform(component.originalBounds, placement.shape)
  setLayoutTransform(node, transform)
  for (const companion of component.companions ?? []) {
    const labelNode = findSvgElementById(doc, companion.id)
    if (!labelNode) throw new Error(`既有 Tag 標籤 ${companion.id} 在 SVG 中不存在。`)
    setLayoutTransform(labelNode, transform)
  }
}
