import { isRecord } from '../config/validateFuxaConfig'
import { findSvgElementById } from './parseSvg'

const FLOOR_ARTIFACT_NAMES = new Set([
  'fuxa_floor_section_title',
  'fuxa_floor_section_frame',
])

interface ManagedComponentRef {
  managed?: boolean
  shapeId?: unknown
  alarmShapeId?: unknown
  labelId?: unknown
}

export interface ManagedSvgModelRef {
  components?: readonly ManagedComponentRef[]
  originalComponents?: readonly ManagedComponentRef[]
  floorTitles?: Record<string, unknown>
  floorFrames?: Record<string, unknown>
  originalFloorTitleIds?: Record<string, unknown>
  floorTitleIds?: Record<string, unknown>
  originalFloorFrameIds?: Record<string, unknown>
  floorFrameIds?: Record<string, unknown>
}

export interface ManagedSvgViewRef {
  items: Record<string, unknown>
}

function addStringValues(target: Set<string>, values: unknown): void {
  if (!Array.isArray(values)) return
  for (const value of values) {
    if (typeof value === 'string' && value) target.add(value)
  }
}

function addRecordValues(target: Set<string>, record: unknown): void {
  if (!isRecord(record)) return
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && value) target.add(value)
    else addStringValues(target, value)
  }
}

function addComponentIds(target: Set<string>, components: unknown): void {
  if (!Array.isArray(components)) return
  for (const component of components) {
    if (!isRecord(component) || component.managed === false) continue
    for (const key of ['shapeId', 'alarmShapeId', 'labelId'] as const) {
      const id = component[key]
      if (typeof id === 'string' && id) target.add(id)
    }
  }
}

function managedIds(model: ManagedSvgModelRef, view: ManagedSvgViewRef): Set<string> {
  const ids = new Set<string>()
  addComponentIds(ids, model.originalComponents)
  addComponentIds(ids, model.components)
  addRecordValues(ids, model.floorTitles)
  addRecordValues(ids, model.floorFrames)
  addRecordValues(ids, model.originalFloorTitleIds)
  addRecordValues(ids, model.floorTitleIds)
  addRecordValues(ids, model.originalFloorFrameIds)
  addRecordValues(ids, model.floorFrameIds)

  for (const [id, item] of Object.entries(view.items)) {
    if (isRecord(item) && FLOOR_ARTIFACT_NAMES.has(String(item.name))) ids.add(id)
  }
  return ids
}

export function removeManagedFromView(
  view: ManagedSvgViewRef,
  model: ManagedSvgModelRef,
  doc: XMLDocument,
): void {
  const ids = managedIds(model, view)
  const allNodes = Array.from(doc.getElementsByTagName('*'))

  for (const node of allNodes) {
    if (!FLOOR_ARTIFACT_NAMES.has(node.getAttribute('data-name') ?? '')) continue
    node.parentNode?.removeChild(node)
  }

  for (const id of ids) {
    const node = findSvgElementById(doc, id)
    const pairWrapper = node?.closest('[data-fuxa-icon-pair-wrapper]')
    const removeNode = pairWrapper ?? node
    removeNode?.parentNode?.removeChild(removeNode)
    delete view.items[id]
  }
}
