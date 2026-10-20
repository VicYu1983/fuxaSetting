import { describe, expect, it } from 'vitest'
import {
  getSvgTextBounds,
  layoutComponents,
  measureSvgText,
} from '../../src/domain/layout/gridLayout'
import { DEFAULT_GRID } from '../../src/domain/layout/gridSettings'

describe('Grid component layout', () => {
  it('places mixed shapes in row-major order and supports every label position', () => {
    const components = Array.from({ length: 5 }, (_, index) => ({
      key: String(index),
      template: index === 4 ? 'cylinder' : 'rect',
    }))
    const placements = layoutComponents(components, {
      columns: 3,
      originX: 10,
      originY: 20,
      gapX: 5,
      gapY: 6,
      labelPosition: 'above',
      labelOffset: 4,
      labelFontSize: 10,
    })

    expect(placements).toHaveLength(5)
    expect(placements[0]?.shape).toEqual({ x: 10, y: 20, width: 40, height: 40 })
    expect(placements[1]?.shape.x).toBe(55)
    expect(placements[3]?.shape.x).toBe(10)
    expect(placements[3]?.shape.y).toBe(80)
    expect(placements[0]?.label).toEqual({ x: 30, y: 16, anchor: 'middle' })
    expect(placements[4]?.shape.width).toBe(60)

    for (const labelPosition of ['above', 'below', 'left', 'right'] as const) {
      const [placement] = layoutComponents([{ key: 'single', template: 'rect' }], {
        ...DEFAULT_GRID,
        labelPosition,
      })
      expect(Number.isFinite(placement?.label.x)).toBe(true)
      expect(Number.isFinite(placement?.label.y)).toBe(true)
      expect(['start', 'middle', 'end']).toContain(placement?.label.anchor)
    }
  })

  it('reserves per-column and per-row space for measured existing SVG shapes', () => {
    const placements = layoutComponents([
      { key: 'existing-wide', template: 'existing', layoutWidth: 100, layoutHeight: 50 },
      { key: 'standard', template: 'rect' },
      { key: 'next-row', template: 'rect' },
    ], {
      columns: 2,
      originX: 10,
      originY: 20,
      gapX: 10,
      gapY: 5,
      labelFontSize: 10,
      labelOffset: 0,
    })

    expect(placements[0]?.shape.width).toBe(100)
    expect(placements[1]?.shape.x).toBe(120)
    expect(placements[2]?.shape.y).toBe(85)
  })

  it('reserves the standard Switch dimensions for Coil controls', () => {
    const [placement] = layoutComponents([{ key: 'switch', template: 'switch' }], DEFAULT_GRID)

    expect(placement?.shape).toMatchObject({ width: 50, height: 28 })
  })

  it('scales standard shapes by iconScale but keeps measured existing sizes', () => {
    const placements = layoutComponents([
      { key: 'rect', template: 'rect' },
      { key: 'cylinder', template: 'cylinder' },
      { key: 'switch', template: 'switch' },
      { key: 'existing', template: 'existing', layoutWidth: 100, layoutHeight: 50 },
    ], { ...DEFAULT_GRID, iconScale: 150 })

    expect(placements[0]?.shape).toMatchObject({ width: 60, height: 60 })
    expect(placements[1]?.shape).toMatchObject({ width: 90, height: 96 })
    expect(placements[2]?.shape).toMatchObject({ width: 75, height: 42 })
    expect(placements[3]?.shape).toMatchObject({ width: 100, height: 50 })
  })

  it('falls back to 100% when iconScale is missing or invalid', () => {
    const [placement] = layoutComponents([{ key: 'rect', template: 'rect' }], {
      iconScale: Number.NaN,
    })

    expect(placement?.shape).toMatchObject({ width: 40, height: 40 })
  })
})

describe('SVG text measurement', () => {
  it('measures CJK glyphs and Latin characters consistently', () => {
    expect(measureSvgText('A中', 10)).toBe(16)
    expect(measureSvgText('', 14)).toBe(0)
  })

  it('calculates text bounds for start, middle and end anchors', () => {
    expect(getSvgTextBounds('AB', 10, 20, 'start', 10)).toEqual({
      left: 10,
      right: 22,
      top: 12,
      bottom: 22,
    })
    expect(getSvgTextBounds('AB', 10, 20, 'middle', 10).left).toBe(4)
    expect(getSvgTextBounds('AB', 10, 20, 'end', 10).left).toBe(-2)
  })
})
