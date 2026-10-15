import type { FloorLayoutSection } from '../layout/floorLayout'

export interface FloorArtifactModel {
  floorTitles: Record<string, unknown>
  floorTitleIds: Record<string, unknown>
  floorFrames: Record<string, unknown>
  floorFrameIds: Record<string, unknown>
  floorFrameShapeIds: Record<string, unknown>
}

function floorTitleKey(floor: string): string {
  return `floor:${floor}`
}

export function cleanupInactiveFloorArtifacts(
  model: FloorArtifactModel,
  sections: readonly FloorLayoutSection[],
): void {
  const activeKeys = new Set(sections.map((section) => floorTitleKey(section.floor)))
  const keys = new Set([
    ...Object.keys(model.floorTitles),
    ...Object.keys(model.floorTitleIds),
    ...Object.keys(model.floorFrames),
    ...Object.keys(model.floorFrameIds),
    ...Object.keys(model.floorFrameShapeIds),
  ])

  for (const key of keys) {
    if (activeKeys.has(key)) continue
    delete model.floorTitles[key]
    delete model.floorTitleIds[key]
    delete model.floorFrames[key]
    delete model.floorFrameIds[key]
    delete model.floorFrameShapeIds[key]
  }
}
