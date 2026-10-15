import type { FloorGroupFrameSettings, GridSettings } from '../config/types'
import type { FloorLayoutSection } from '../layout/floorLayout'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

export interface FloorArtifactNodes {
  titleNode: Element
  titleEntry: Record<string, unknown>
  frameNode: Element
  frameEntry: Record<string, unknown>
}

function createSvgNode(
  doc: XMLDocument,
  name: string,
  attributes: Record<string, string | number>,
): Element {
  const node = doc.createElementNS(SVG_NAMESPACE, name)
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value))
  }
  return node
}

function preserveEntry(
  existing: unknown,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(existing && typeof existing === 'object' && !Array.isArray(existing)
      ? existing
      : {}),
    ...fields,
  }
}

export function buildFloorArtifactNodes(
  doc: XMLDocument,
  section: FloorLayoutSection,
  ids: { titleId: string; frameId: string; frameShapeId?: string },
  grid: GridSettings,
  frame: FloorGroupFrameSettings,
  existingEntries: { title?: unknown; frame?: unknown } = {},
): FloorArtifactNodes {
  const titleNode = createSvgNode(doc, 'text', {
    'data-name': 'fuxa_floor_section_title',
    'data-floor-group': section.floor,
    id: ids.titleId,
    type: 'svg-ext-shapes-text',
    x: section.x,
    y: section.titleY,
    fill: '#1d4ed8',
    stroke: '#1d4ed8',
    'stroke-width': '0',
    'font-size': grid.labelFontSize,
    'font-family': 'sans-serif',
    'font-weight': 'bold',
    'text-anchor': 'start',
    'xml:space': 'preserve',
  })
  titleNode.textContent = section.title

  const frameNode = createSvgNode(doc, 'g', {
    'data-name': 'fuxa_floor_section_frame',
    'data-floor-group': section.floor,
    id: ids.frameId,
    type: 'svg-ext-shapes-rectangle',
    fill: frame.fill,
    stroke: frame.stroke,
    'stroke-width': frame.strokeWidth,
  })
  const frameAttributes: Record<string, string | number> = {
    x: section.frame.x,
    y: section.frame.y,
    width: section.frame.width,
    height: section.frame.height,
    rx: frame.cornerRadius,
    ry: frame.cornerRadius,
    fill: frame.fill,
    'fill-opacity': frame.fillOpacity,
    stroke: frame.stroke,
    'stroke-width': frame.strokeWidth,
  }
  if (ids.frameShapeId) frameAttributes.id = ids.frameShapeId
  frameNode.appendChild(createSvgNode(doc, 'rect', frameAttributes))

  return {
    titleNode,
    titleEntry: preserveEntry(existingEntries.title, {
      id: ids.titleId,
      type: 'svg-ext-shapes-text',
      name: 'fuxa_floor_section_title',
      property: null,
      label: 'Shapes',
      hide: false,
      lock: false,
    }),
    frameNode,
    frameEntry: preserveEntry(existingEntries.frame, {
      id: ids.frameId,
      type: 'svg-ext-shapes-rectangle',
      name: 'fuxa_floor_section_frame',
      property: null,
      label: 'Shapes',
      hide: false,
      lock: false,
    }),
  }
}
