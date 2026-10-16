import { describe, expect, it } from 'vitest'
import type { GridSettings } from '../../src/domain/config/types'
import type { IconAsset } from '../../src/domain/icons/iconLibrary'
import type { ComponentPlacement } from '../../src/domain/layout/gridLayout'
import { buildComponentNodes } from '../../src/domain/svg/buildComponentNodes'
import type { SvgComponent } from '../../src/domain/svg/buildComponentNodes'

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

  setAttributeNS(_namespace: string, name: string, value: string): void {
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

const placement: ComponentPlacement = {
  key: 'component-1',
  shape: { x: 20, y: 30, width: 40, height: 40 },
  label: { x: 40, y: 20, anchor: 'middle' },
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

function component(overrides: Partial<SvgComponent> = {}): SvgComponent {
  return {
    key: 'component-1',
    seq: 1,
    tagId: 'tag-1',
    label: 'Pump',
    template: 'rect',
    palette: 'normal',
    shapeId: 'shape-1',
    labelId: 'label-1',
    shapeInnerIds: [],
    managed: true,
    ...overrides,
  }
}

const icon: IconAsset = {
  id: 'icon-1',
  mimeType: 'image/png',
  dataUrl: 'data:image/png;base64,AA==',
}

function build(
  model: SvgComponent,
  icons: readonly IconAsset[] = [],
  ids: string[] = ['inner-1', 'inner-2'],
) {
  let nextId = 0
  return buildComponentNodes(
    doc,
    model,
    placement,
    grid,
    (id) => icons.find((candidate) => candidate.id === id),
    (prefix) => {
      const id = ids[nextId]
      nextId += 1
      return `${prefix}-${id ?? nextId}`
    },
  )
}

describe('buildComponentNodes', () => {
  it('builds rectangle and label nodes and persists allocated inner IDs', () => {
    const model = component()
    const result = build(model)
    const [shape] = result.shapeNodes as unknown as TestElement[]
    const label = result.labelNode as unknown as TestElement

    expect(shape?.localName).toBe('g')
    expect(shape?.attributes).toMatchObject({
      'data-name': 'tc_1',
      id: 'shape-1',
      type: 'svg-ext-shapes-rectangle',
      fill: '#FFFFFF',
    })
    expect(shape?.children[0]?.attributes).toMatchObject({
      id: 'SHE-inner-1',
      x: '20',
      y: '30',
      width: '40',
      height: '40',
    })
    expect(model.shapeInnerIds).toEqual(['SHE-inner-1'])
    expect(label.attributes).toMatchObject({
      'data-name': 'tc_1_label',
      id: 'label-1',
      'font-size': '14',
      'text-anchor': 'middle',
    })
    expect(label.textContent).toBe('Pump')
  })

  it('builds an icon shape with linked image and state marker', () => {
    const result = build(component({ template: 'icon', iconId: icon.id }), [icon])
    const shape = result.shapeNodes[0] as unknown as TestElement
    const [image, marker] = shape.children

    expect(shape.attributes.fill).toBe('#00ff07ff')
    expect(image?.attributes).toMatchObject({
      'data-fuxa-icon-id': icon.id,
      'xlink:href': icon.dataUrl,
      width: '40',
      height: '40',
    })
    expect(marker?.attributes).toMatchObject({
      'data-fuxa-state-marker': 'true',
      x: '52',
      y: '62',
      width: '8',
      height: '8',
    })
  })

  it('builds cylinder paths and normal/alarm icon pairs', () => {
    const cylinder = build(component({ template: 'cylinder' }))
    const paths = (cylinder.shapeNodes[0] as unknown as TestElement).children
    expect(paths.map((path) => path.localName)).toEqual(['path', 'path'])
    expect(paths[0]?.attributes.d).toContain('M 20 40')

    const pair = build(component({
      template: 'icon-pair',
      normalIconId: 'normal',
      alarmIconId: 'alarm',
      alarmShapeId: 'alarm-shape',
    }), [
      { ...icon, id: 'normal' },
      { ...icon, id: 'alarm' },
    ])
    expect(pair.shapeNodes.map((node) => (node as unknown as TestElement).attributes)).toMatchObject([
      { 'data-name': 'tc_1', id: 'shape-1', 'data-fuxa-icon-id': 'normal' },
      { 'data-name': 'tc_1_alarm', id: 'alarm-shape', 'data-fuxa-icon-id': 'alarm' },
    ])
  })

  it('builds a FUXA HTML Switch with SVG fallback and unique inner IDs', () => {
    const model = component({ template: 'switch' })
    const result = build(model, [], ['hitbox', 'track', 'knob', 'foreign', 'html-label'])
    const shape = result.shapeNodes[0] as unknown as TestElement
    const foreignObject = shape.children[3]

    expect(shape.attributes).toMatchObject({
      id: 'shape-1',
      type: 'svg-ext-html_switch',
      'data-name': 'tc_1',
    })
    expect(shape.children.map((child) => child.localName))
      .toEqual(['rect', 'rect', 'circle', 'foreignObject'])
    expect(foreignObject?.attributes).toMatchObject({
      width: '50',
      height: '28',
    })
    expect(foreignObject?.children[0]?.localName).toBe('label')
    expect(foreignObject?.children[0]?.children[0]?.localName).toBe('ngx-switch')
    expect(model.shapeInnerIds).toEqual([
      'SHE-hitbox',
      'SHE-track',
      'SHE-knob',
      'SHE-foreign',
      'SHE-html-label',
    ])
    expect(result.labelNode.textContent).toBe('Pump')
  })

  it('builds stacked multi-state images from lowest to highest priority', () => {
    const alarm = { ...icon, id: 'icon-alarm' }
    const high = { ...icon, id: 'icon-high' }
    const result = build(component({
      template: 'icon-multi',
      multiIconSetId: 'set-tank',
      normalIconId: icon.id,
      multiStateBindings: [
        { stateKey: 'alarm', iconId: alarm.id, tagId: 'tag-alarm', shapeId: 'shape-alarm' },
        { stateKey: 'high', iconId: high.id, tagId: 'tag-high', shapeId: 'shape-high' },
      ],
    }), [icon, alarm, high])
    const shapes = result.shapeNodes as unknown as TestElement[]
    expect(shapes.map((shape) => shape.attributes['data-fuxa-state-key']))
      .toEqual(['normal', 'high', 'alarm'])
    expect(shapes.map((shape) => shape.attributes['data-fuxa-state-priority']))
      .toEqual([undefined, '1', '0'])
    expect(shapes.map((shape) => shape.attributes.id))
      .toEqual(['shape-1', 'shape-high', 'shape-alarm'])
    expect(shapes.every((shape) =>
      shape.attributes['data-fuxa-icon-set-id'] === 'set-tank')).toBe(true)
  })

  it('reports missing configured icons rather than emitting incomplete SVG', () => {
    expect(() => build(component({ template: 'icon', iconId: 'missing' })))
      .toThrow('元件「Pump」使用的圖示不存在。')
    expect(() => build(component({
      template: 'icon-pair',
      normalIconId: 'normal',
      alarmIconId: 'alarm',
      alarmShapeId: '',
    }), [
      { ...icon, id: 'normal' },
      { ...icon, id: 'alarm' },
    ])).toThrow('尚未設定正常與告警圖示。')
  })
})
