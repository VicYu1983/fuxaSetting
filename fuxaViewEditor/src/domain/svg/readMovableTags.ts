import { isRecord } from '../config/validateFuxaConfig'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const FLOOR_LAYOUT_TRANSFORM = /^translate\(-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?\)$/
const SVG_GRAPHICS = new Set([
  'g',
  'rect',
  'circle',
  'ellipse',
  'path',
  'polygon',
  'polyline',
  'line',
  'text',
  'image',
  'use',
])

export interface MovableTagCandidate {
  id: string
  name: string
  tagId: string
  type: string
  nodeName: string
  reason: string
}

export interface MovableTagAnalysis {
  movableTags: MovableTagCandidate[]
  unmanaged: MovableTagCandidate[]
}

function countElementIds(doc: XMLDocument): Map<string, number> {
  const counts = new Map<string, number>()
  for (const element of Array.from(doc.getElementsByTagName('*'))) {
    const id = element.getAttribute('id')
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

function itemName(item: unknown): string {
  return isRecord(item) && typeof item.name === 'string' ? item.name : ''
}

function movementBlockReason(node: Element | null, id: string, idCounts: Map<string, number>): string {
  if (!node) return '找不到對應的 SVG 元件'
  if (idCounts.get(id) !== 1) return 'SVG 元件 ID 重複，無法安全辨識位置'
  if (node.namespaceURI !== SVG_NAMESPACE || !SVG_GRAPHICS.has(node.localName)) {
    return `不支援移動 SVG ${node.localName} 元件`
  }

  const transform = node.getAttribute('transform')
  if (
    transform
    && !(
      node.getAttribute('data-fuxa-floor-layout') === 'floor-layout-v1'
      && FLOOR_LAYOUT_TRANSFORM.test(transform)
    )
  ) {
    return '元件已有 transform，為避免改變原有定位而不自動移動'
  }

  let parent = node.parentElement
  while (parent && parent.localName !== 'svg') {
    if (parent.getAttribute('transform')) {
      return '上層 SVG 群組已有 transform，為避免改變原有定位而不自動移動'
    }
    parent = parent.parentElement
  }
  return ''
}

export function readMovableTags(
  items: Record<string, unknown>,
  doc: XMLDocument,
  consumed: ReadonlySet<string> = new Set(),
): MovableTagAnalysis {
  const movableTags: MovableTagCandidate[] = []
  const unmanaged: MovableTagCandidate[] = []
  const idCounts = countElementIds(doc)

  for (const [id, item] of Object.entries(items)) {
    if (consumed.has(id) || !isRecord(item) || !isRecord(item.property)) continue
    if (typeof item.property.variableId !== 'string') continue

    let node: Element | null = null
    for (const element of Array.from(doc.getElementsByTagName('*'))) {
      if (element.getAttribute('id') === id) {
        node = element
        break
      }
    }
    const reason = movementBlockReason(node, id, idCounts)
    const candidate: MovableTagCandidate = {
      id,
      name: itemName(item) || id,
      tagId: item.property.variableId,
      type: typeof item.type === 'string' ? item.type : '',
      nodeName: node?.localName ?? '',
      reason,
    }
    if (reason) unmanaged.push(candidate)
    else movableTags.push(candidate)
  }

  return { movableTags, unmanaged }
}
