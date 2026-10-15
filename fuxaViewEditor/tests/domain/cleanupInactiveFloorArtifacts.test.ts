import { describe, expect, it } from 'vitest'
import type { FloorLayoutSection } from '../../src/domain/layout/floorLayout'
import { cleanupInactiveFloorArtifacts } from '../../src/domain/svg/cleanupInactiveFloorArtifacts'

function section(floor: string): FloorLayoutSection {
  return {
    floor,
    title: floor || '未設定樓層',
    titleY: 0,
    x: 0,
    frame: { x: 0, y: 0, width: 10, height: 10 },
    entries: [],
  }
}

describe('cleanupInactiveFloorArtifacts', () => {
  it('removes all artifact metadata for inactive floors and keeps active keys', () => {
    const model = {
      floorTitles: { 'floor:1F': 'title-1', 'floor:2F': 'title-2' },
      floorTitleIds: { 'floor:1F': ['title-1'], 'floor:2F': ['title-2'] },
      floorFrames: { 'floor:1F': 'frame-1', 'floor:2F': 'frame-2' },
      floorFrameIds: { 'floor:1F': ['frame-1'], 'floor:2F': ['frame-2'] },
      floorFrameShapeIds: { 'floor:1F': 'shape-1', 'floor:2F': 'shape-2' },
    }

    cleanupInactiveFloorArtifacts(model, [section('1F')])

    expect(model).toEqual({
      floorTitles: { 'floor:1F': 'title-1' },
      floorTitleIds: { 'floor:1F': ['title-1'] },
      floorFrames: { 'floor:1F': 'frame-1' },
      floorFrameIds: { 'floor:1F': ['frame-1'] },
      floorFrameShapeIds: { 'floor:1F': 'shape-1' },
    })
  })

  it('clears all floor artifact maps when there are no layout sections', () => {
    const model = {
      floorTitles: { 'floor:1F': 'title' },
      floorTitleIds: { 'floor:1F': ['title'] },
      floorFrames: { 'floor:1F': 'frame' },
      floorFrameIds: { 'floor:1F': ['frame'] },
      floorFrameShapeIds: { 'floor:1F': 'shape' },
    }

    cleanupInactiveFloorArtifacts(model, [])

    expect(model).toEqual({
      floorTitles: {},
      floorTitleIds: {},
      floorFrames: {},
      floorFrameIds: {},
      floorFrameShapeIds: {},
    })
  })
})
