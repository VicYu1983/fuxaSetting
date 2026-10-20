import { describe, expect, it } from 'vitest'
import type { FloorGroupFrameSettings } from '../../src/domain/config/types'
import {
  DEFAULT_FLOOR_GROUP_FRAME,
  getFloorGroupFrameSettings,
  normalizeFloorGroupFrameSettings,
  saveFloorGroupFrameSettings,
} from '../../src/domain/layout/floorGroupFrame'
import { layoutFloorComponents } from '../../src/domain/layout/floorLayout'
import { DEFAULT_GRID } from '../../src/domain/layout/gridSettings'

describe('Floor group frame settings', () => {
  it('normalizes and stores styling without discarding sibling settings', () => {
    const config = {
      devices: {},
      hmi: { views: [] },
      extra: {
        keep: true,
        fuxaSetting: {
          note: 'keep',
          viewGrids: { 'view-a': { columns: 3 } },
          floorGroupFrames: { fill: '#123456', fillOpacity: 0.8, padding: 24 },
        },
      },
    }

    expect(getFloorGroupFrameSettings(config)).toEqual({
      ...DEFAULT_FLOOR_GROUP_FRAME,
      fill: '#123456',
      fillOpacity: 0.8,
      padding: 24,
    })
    expect(getFloorGroupFrameSettings({ devices: {}, hmi: { views: [] } }))
      .toEqual(DEFAULT_FLOOR_GROUP_FRAME)

    const saved = saveFloorGroupFrameSettings(config, {
      fill: '#ABCDEF',
      fillOpacity: 0.4,
      stroke: '#010203',
      strokeWidth: 2,
      cornerRadius: 8,
      padding: 12,
    })

    expect(saved).toEqual({
      fill: '#abcdef',
      fillOpacity: 0.4,
      stroke: '#010203',
      strokeWidth: 2,
      cornerRadius: 8,
      padding: 12,
    })
    expect(config.extra.keep).toBe(true)
    expect(config.extra.fuxaSetting.note).toBe('keep')
    expect(config.extra.fuxaSetting.viewGrids).toEqual({ 'view-a': { columns: 3 } })
  })

  it('ignores invalid colors and out-of-range styling values', () => {
    expect(normalizeFloorGroupFrameSettings({
      fill: 'red',
      strokeWidth: 11,
      cornerRadius: -1,
      padding: 201,
      fillOpacity: 2,
    })).toEqual(DEFAULT_FLOOR_GROUP_FRAME)
  })
})

describe('Floor layout', () => {
  it('positions floor groups in order and wraps each group in a frame', () => {
    const tags = new Map([
      ['a', { floor: '1F' }],
      ['b', { floor: '1F' }],
      ['c', { floor: 'B1F' }],
      ['manually-removed', { floor: '3F' }],
    ])
    const components = ['a', 'b', 'c'].map((tagId, index) => ({
      key: tagId,
      tagId,
      template: 'rect',
      seq: index,
      label: tagId,
    }))
    const result = layoutFloorComponents(components, {
      ...DEFAULT_GRID,
      columns: 2,
      originX: 10,
      originY: 20,
      gapY: 5,
    }, tags)

    expect(result.sections.map((section) => section.title)).toEqual(['B1F', '1F'])
    expect(result.sections[1]?.entries.map(({ component }) => component.tagId)).toEqual(['a', 'b'])
    expect(result.sections[0]?.entries[0]?.placement.shape.x).toBe(10)
    expect(result.sections[0]?.frame.x).toBe(10)
    expect(
      (result.sections[0]?.frame.x ?? 0) + (result.sections[0]?.frame.width ?? 0),
    ).toBe(1024 - 10)
    expect(result.sections[0]?.frame.y)
      .toBeLessThan(result.sections[0]?.titleY ?? 0)
    expect(result.sections[1]?.frame.y)
      .toBeGreaterThanOrEqual(
        (result.sections[0]?.frame.y ?? 0) + (result.sections[0]?.frame.height ?? 0),
      )
    expect(result.sections[1]?.titleY)
      .toBeGreaterThan(result.sections[0]?.entries[0]?.placement.shape.y ?? 0)
    expect(result.placements).toHaveLength(3)
    expect(result.placements.some(({ component }) => component.tagId === 'manually-removed'))
      .toBe(false)
  })

  it('includes transformed bounds of existing companion labels', () => {
    const component = {
      key: 'existing-tag',
      tagId: 'tag-a',
      template: 'existing',
      managed: false,
      originalBounds: { x: 100, y: 150, width: 40, height: 40 },
      layoutWidth: 40,
      layoutHeight: 40,
      label: 'Existing label',
      companions: [{ bounds: { x: 80, y: 125, width: 80, height: 16 } }],
    }
    const result = layoutFloorComponents([component], {
      ...DEFAULT_GRID,
      originX: 100,
      originY: 150,
    }, new Map([['tag-a', { floor: '1F' }]]))
    const section = result.sections[0]
    if (!section) throw new Error('Expected a floor section')
    const { frame, entries } = section
    const placement = entries[0]?.placement
    if (!placement) throw new Error('Expected a component placement')
    const dx = placement.shape.x - component.originalBounds.x
    const dy = placement.shape.y - component.originalBounds.y

    expect(frame.x).toBeLessThanOrEqual(80 + dx)
    expect(frame.y).toBeLessThanOrEqual(125 + dy)
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(160 + dx)
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(141 + dy)
  })

  it('supports explicit shared frame settings', () => {
    const frameSettings: FloorGroupFrameSettings = {
      ...DEFAULT_FLOOR_GROUP_FRAME,
      padding: 30,
    }
    const result = layoutFloorComponents([{
      key: 'component-a',
      tagId: 'tag-a',
      template: 'rect',
      label: 'A',
    }], DEFAULT_GRID, new Map([['tag-a', { floor: '1F' }]]), frameSettings)

    expect(result.sections[0]?.frame.x).toBeLessThan(DEFAULT_GRID.originX - 15)
  })

  it('aligns every floor frame to the canvas edges with a 10px inset', () => {
    const result = layoutFloorComponents([
      { key: 'short', tagId: 'tag-a', template: 'rect', label: 'A' },
      { key: 'long', tagId: 'tag-b', template: 'rect', label: 'A much longer label' },
    ], {
      ...DEFAULT_GRID,
      originX: 120,
    }, new Map([
      ['tag-a', { floor: '1F' }],
      ['tag-b', { floor: '2F' }],
    ]), DEFAULT_FLOOR_GROUP_FRAME, 800)

    expect(result.sections).toHaveLength(2)
    expect(result.sections.map(({ frame }) => frame.x)).toEqual([10, 10])
    expect(result.sections.map(({ frame }) => frame.width)).toEqual([780, 780])
  })
})
