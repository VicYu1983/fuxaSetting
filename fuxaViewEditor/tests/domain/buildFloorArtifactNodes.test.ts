import { describe, expect, it } from 'vitest'
import type { FloorGroupFrameSettings, GridSettings } from '../../src/domain/config/types'
import type { FloorLayoutSection } from '../../src/domain/layout/floorLayout'
import { buildFloorArtifactNodes } from '../../src/domain/svg/buildFloorArtifactNodes'

class TestElement {
  readonly localName: string
  readonly attributes: Record<string, string> = {}
  readonly children: TestElement[] = []
  textContent = ''

  constructor(localName: string) {
    this.localName = localName
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  appendChild(child: TestElement): TestElement {
    this.children.push(child)
    return child
  }
}

const doc = {
  createElementNS(_namespace: string, name: string) {
    return new TestElement(name)
  },
} as unknown as XMLDocument

const section: FloorLayoutSection = {
  floor: '1F',
  title: '1F',
  titleY: 94,
  x: 60,
  frame: { x: 44, y: 66, width: 120, height: 100 },
  entries: [],
}

const grid: GridSettings = {
  columns: 4,
  originX: 60,
  originY: 80,
  gapX: 40,
  gapY: 40,
  labelPosition: 'above',
  labelOffset: 10,
  labelFontSize: 14,
}

const frame: FloorGroupFrameSettings = {
  fill: '#eff6ff',
  fillOpacity: 0.55,
  stroke: '#93c5fd',
  strokeWidth: 1,
  cornerRadius: 12,
  padding: 16,
}

describe('buildFloorArtifactNodes', () => {
  it('builds a floor title and frame node with matching FUXA items entries', () => {
    const result = buildFloorArtifactNodes(
      doc,
      section,
      { titleId: 'title-id', frameId: 'frame-id', frameShapeId: 'frame-rect-id' },
      grid,
      frame,
    )
    const title = result.titleNode as unknown as TestElement
    const frameGroup = result.frameNode as unknown as TestElement
    const frameRect = frameGroup.children[0]

    expect(title.localName).toBe('text')
    expect(title.attributes).toEqual({
      'data-name': 'fuxa_floor_section_title',
      'data-floor-group': '1F',
      id: 'title-id',
      type: 'svg-ext-shapes-text',
      x: '60',
      y: '94',
      fill: '#1d4ed8',
      stroke: '#1d4ed8',
      'stroke-width': '0',
      'font-size': '14',
      'font-family': 'sans-serif',
      'font-weight': 'bold',
      'text-anchor': 'start',
      'xml:space': 'preserve',
    })
    expect(title.textContent).toBe('1F')
    expect(result.titleEntry).toEqual({
      id: 'title-id',
      type: 'svg-ext-shapes-text',
      name: 'fuxa_floor_section_title',
      property: null,
      label: 'Shapes',
      hide: false,
      lock: false,
    })
    expect(frameGroup.attributes).toMatchObject({
      id: 'frame-id',
      'data-name': 'fuxa_floor_section_frame',
      fill: frame.fill,
      stroke: frame.stroke,
    })
    expect(frameRect?.attributes).toMatchObject({
      id: 'frame-rect-id',
      x: '44',
      y: '66',
      width: '120',
      height: '100',
      rx: '12',
      ry: '12',
      'fill-opacity': '0.55',
    })
    expect(result.frameEntry.name).toBe('fuxa_floor_section_frame')
  })

  it('preserves unrelated existing item fields and omits an empty inner shape ID', () => {
    const result = buildFloorArtifactNodes(
      doc,
      section,
      { titleId: 'title-id', frameId: 'frame-id' },
      grid,
      frame,
      {
        title: { custom: { retained: true }, hide: true },
        frame: { customFrameField: 7 },
      },
    )
    const rect = (result.frameNode as unknown as TestElement).children[0]
    expect(result.titleEntry).toMatchObject({
      custom: { retained: true },
      hide: false,
      id: 'title-id',
    })
    expect(result.frameEntry).toMatchObject({
      customFrameField: 7,
      id: 'frame-id',
    })
    expect(rect?.attributes.id).toBeUndefined()
  })
})
