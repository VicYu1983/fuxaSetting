import { describe, expect, it } from 'vitest'
import { layoutFloorComponents } from '../../../src/domain/layout/floorLayout'
import { layoutExceedsCanvas } from '../../../src/features/preview/prepareViewPreview'

describe('layoutExceedsCanvas', () => {
  it('reports a layout within the canvas as contained', () => {
    const layout = layoutFloorComponents(
      [{ key: 'component-1', tagId: 'tag-1' }],
      { columns: 1, originX: 24, originY: 24 },
      new Map(),
    )

    expect(layoutExceedsCanvas(layout, 1024, 768)).toBe(false)
  })

  it('reports a layout whose shape and floor frame extend outside the canvas', () => {
    const layout = layoutFloorComponents(
      [{ key: 'component-1', tagId: 'tag-1', layoutWidth: 80 }],
      { columns: 1, originX: 990, originY: 24 },
      new Map(),
    )

    expect(layoutExceedsCanvas(layout, 1024, 768)).toBe(true)
  })
})
