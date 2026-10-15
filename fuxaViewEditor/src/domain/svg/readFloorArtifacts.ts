import { normalizeFloor } from '../tags/floor'
import { isRecord } from '../config/validateFuxaConfig'
import { findSvgElementById } from './parseSvg'

export interface FloorArtifactItem {
  name?: unknown
}

export interface UnassignedFloorFrame {
  id: string
  node: Element
}

export interface ReadFloorArtifactsResult {
  floorTitles: Record<string, string>
  floorTitleIds: Record<string, string[]>
  floorFrames: Record<string, string>
  floorFrameIds: Record<string, string[]>
  floorFrameShapeIds: Record<string, string>
  floorTitleNodes: Record<string, Element>
  unassignedFloorFrames: UnassignedFloorFrame[]
  consumed: Set<string>
}

function addFloorId(idsByFloor: Record<string, string[]>, floorKey: string, id: string): void {
  const ids = idsByFloor[floorKey] ?? []
  if (!ids.includes(id)) ids.push(id)
  idsByFloor[floorKey] = ids
}

function itemName(item: unknown): string {
  return isRecord(item) && typeof item.name === 'string' ? item.name : ''
}

function inferredTitleFloor(node: Element, id: string, artifactFloorById: Map<string, string>): string {
  const floor = node.getAttribute('data-floor-group')
  if (floor !== null) return `floor:${normalizeFloor(floor)}`
  const text = (node.textContent || '').trim()
  if (text) return `floor:${normalizeFloor(text === '未設定樓層' ? '' : text)}`
  return artifactFloorById.get(id) || ''
}

export function readFloorArtifacts(
  items: Record<string, unknown>,
  doc: XMLDocument,
  configuredArtifacts: unknown = {},
): ReadFloorArtifactsResult {
  const floorTitles: Record<string, string> = {}
  const floorTitleIds: Record<string, string[]> = {}
  const floorFrames: Record<string, string> = {}
  const floorFrameIds: Record<string, string[]> = {}
  const floorFrameShapeIds: Record<string, string> = {}
  const floorTitleNodes: Record<string, Element> = {}
  const unassignedFloorFrames: UnassignedFloorFrame[] = []
  const consumed = new Set<string>()
  const artifactFloorById = new Map<string, string>()
  const artifacts = isRecord(configuredArtifacts) ? configuredArtifacts : {}

  for (const [floorKey, artifact] of Object.entries(artifacts)) {
    if (!isRecord(artifact)) continue
    for (const id of [artifact.titleId, artifact.frameId]) {
      if (typeof id === 'string' && id) artifactFloorById.set(id, floorKey)
    }
  }

  for (const [floorKey, artifact] of Object.entries(artifacts)) {
    if (!isRecord(artifact)) continue
    if (typeof artifact.titleId === 'string' && findSvgElementById(doc, artifact.titleId)) {
      floorTitles[floorKey] = artifact.titleId
      addFloorId(floorTitleIds, floorKey, artifact.titleId)
      consumed.add(artifact.titleId)
    }
    const frameId = typeof artifact.frameId === 'string' ? artifact.frameId : undefined
    const frameNode = frameId ? findSvgElementById(doc, frameId) : null
    if (frameId && frameNode) {
      floorFrames[floorKey] = frameId
      addFloorId(floorFrameIds, floorKey, frameId)
      const configuredShape = typeof artifact.frameShapeId === 'string'
        ? findSvgElementById(doc, artifact.frameShapeId)
        : null
      const shapeId = configuredShape?.getAttribute('id')
        ?? frameNode.querySelector('[id]')?.getAttribute('id')
      if (shapeId) floorFrameShapeIds[floorKey] = shapeId
      consumed.add(frameId)
    }
  }

  for (const [shapeId, shapeItem] of Object.entries(items)) {
    if (itemName(shapeItem) === 'fuxa_floor_section_frame') {
      const frameNode = findSvgElementById(doc, shapeId)
      const floor = frameNode?.getAttribute('data-floor-group')
      const key = frameNode && floor !== null
        ? `floor:${normalizeFloor(floor)}`
        : artifactFloorById.get(shapeId)
      if (frameNode && typeof key === 'string') {
        if (!floorFrames[key]) floorFrames[key] = shapeId
        addFloorId(floorFrameIds, key, shapeId)
        const shapeIdInsideFrame = frameNode.querySelector('[id]')?.getAttribute('id')
        if (shapeIdInsideFrame) floorFrameShapeIds[key] = shapeIdInsideFrame
        consumed.add(shapeId)
        continue
      }
      if (frameNode) {
        unassignedFloorFrames.push({ id: shapeId, node: frameNode })
        consumed.add(shapeId)
        continue
      }
    }

    if (itemName(shapeItem) !== 'fuxa_floor_section_title') continue
    const titleNode = findSvgElementById(doc, shapeId)
    const key = titleNode ? inferredTitleFloor(titleNode, shapeId, artifactFloorById) : ''
    if (!titleNode || !key) continue
    if (!floorTitles[key]) floorTitles[key] = shapeId
    addFloorId(floorTitleIds, key, shapeId)
    if (!floorTitleNodes[key]) floorTitleNodes[key] = titleNode
    consumed.add(shapeId)
  }

  for (const { id, node } of unassignedFloorFrames) {
    const shape = node.localName === 'rect' ? node : node.querySelector('rect')
    if (!shape) continue
    const bounds = ['x', 'y', 'width', 'height'].map((key) => Number(shape.getAttribute(key)))
    if (!bounds.every(Number.isFinite)) continue
    const [x, y, width, height] = bounds
    if (x === undefined || y === undefined || width === undefined || height === undefined) continue
    const matchingFloors = Object.entries(floorTitleNodes).filter(([, title]) => {
      const titleX = Number(title.getAttribute('x'))
      const titleY = Number(title.getAttribute('y'))
      return Number.isFinite(titleX) && Number.isFinite(titleY)
        && titleX >= x && titleX <= x + width
        && titleY >= y && titleY <= y + height
    })
    if (matchingFloors.length !== 1) continue
    const match = matchingFloors[0]
    if (!match) continue
    const [key] = match
    if (!key) continue
    const isCanonicalFrame = !floorFrames[key]
    if (isCanonicalFrame) floorFrames[key] = id
    addFloorId(floorFrameIds, key, id)
    if (isCanonicalFrame) {
      const shapeId = node.querySelector('[id]')?.getAttribute('id')
      if (shapeId) floorFrameShapeIds[key] = shapeId
    }
  }

  return {
    floorTitles,
    floorTitleIds,
    floorFrames,
    floorFrameIds,
    floorFrameShapeIds,
    floorTitleNodes,
    unassignedFloorFrames,
    consumed,
  }
}
