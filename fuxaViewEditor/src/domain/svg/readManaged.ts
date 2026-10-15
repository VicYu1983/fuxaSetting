import { isRecord } from '../config/validateFuxaConfig'
import { readFloorArtifacts } from './readFloorArtifacts'
import type { SvgParserConstructor } from './parseSvg'
import { parseSvg } from './parseSvg'
import { readManagedComponents } from './readManagedComponents'
import type { ManagedComponentRecord } from './readManagedComponents'
import { readMovableTags } from './readMovableTags'
import type { MovableTagCandidate } from './readMovableTags'

export interface ReadManagedResult {
  records: ManagedComponentRecord[]
  unmanaged: MovableTagCandidate[]
  movableTags: MovableTagCandidate[]
  floorTitles?: Record<string, string>
  floorTitleIds?: Record<string, string[]>
  floorFrames?: Record<string, string>
  floorFrameIds?: Record<string, string[]>
  floorFrameShapeIds?: Record<string, string>
  doc?: XMLDocument
  error?: string
}

function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function readManaged(
  view: unknown,
  Parser: SvgParserConstructor,
  floorGroupArtifacts: unknown = {},
): ReadManagedResult {
  const records: ManagedComponentRecord[] = []
  const unmanaged: MovableTagCandidate[] = []
  const movableTags: MovableTagCandidate[] = []
  if (!isRecord(view) || !isRecord(view.items) || typeof view.svgcontent !== 'string') {
    return { records, unmanaged, movableTags, error: 'View 缺少 items 或 svgcontent。' }
  }

  let doc: XMLDocument
  try {
    doc = parseSvg(view.svgcontent, Parser)
  } catch (error) {
    return { records, unmanaged, movableTags, error: parseErrorMessage(error) }
  }

  const floor = readFloorArtifacts(view.items, doc, floorGroupArtifacts)
  const managed = readManagedComponents(view.items, doc, floor.consumed)
  const movable = readMovableTags(view.items, doc, managed.consumed)
  return {
    records: managed.records,
    unmanaged: movable.unmanaged,
    movableTags: movable.movableTags,
    floorTitles: floor.floorTitles,
    floorTitleIds: floor.floorTitleIds,
    floorFrames: floor.floorFrames,
    floorFrameIds: floor.floorFrameIds,
    floorFrameShapeIds: floor.floorFrameShapeIds,
    doc,
  }
}
