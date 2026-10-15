import type { FloorLayoutSection } from '../layout/floorLayout'
import { findSvgElementById } from './parseSvg'

export interface SvgLayer {
  children: HTMLCollection
  appendChild(node: Node): Node
  insertBefore(node: Node, child: Node): Node
}

export function insertFloorFrame(
  layer: SvgLayer,
  frameNode: Node,
  section: FloorLayoutSection,
  doc: XMLDocument,
): void {
  const existingTagNodes = new Set<Element>()
  for (const { component } of section.entries) {
    if (component.managed !== false) continue
    const shape = component.shapeId
      ? findSvgElementById(doc, component.shapeId)
      : null
    if (shape) existingTagNodes.add(shape)
    for (const companion of component.companions ?? []) {
      const label = companion.id ? findSvgElementById(doc, companion.id) : null
      if (label) existingTagNodes.add(label)
    }
  }

  const firstTagChild = Array.from(layer.children).find((child) =>
    Array.from(existingTagNodes).some((node) => child === node || child.contains(node)),
  )
  if (firstTagChild) layer.insertBefore(frameNode, firstTagChild)
  else layer.appendChild(frameNode)
}
