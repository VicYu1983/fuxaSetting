import { describe, expect, it } from 'vitest'
import type { GridSettings, FloorGroupFrameSettings } from '../../src/domain/config/types'
import type { SvgParser } from '../../src/domain/svg/parseSvg'
import { applyModelToView } from '../../src/domain/svg/applyModelToView'
import type {
  ApplyModel,
  ApplyModelToViewOptions,
  ApplyModelView,
} from '../../src/domain/svg/applyModelToView'
import type { SvgComponent } from '../../src/domain/svg/buildComponentNodes'

class TestElement {
  readonly localName: string
  readonly attributes: Record<string, string> = {}
  readonly children: TestElement[] = []
  parentNode: TestElement | null = null
  textContent = ''

  constructor(localName: string, attributes: Record<string, string> = {}) {
    this.localName = localName
    Object.assign(this.attributes, attributes)
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  setAttributeNS(_namespace: string, name: string, value: string): void {
    this.attributes[name] = value
  }

  removeAttribute(name: string): void {
    delete this.attributes[name]
  }

  appendChild(node: TestElement): TestElement {
    node.parentNode = this
    this.children.push(node)
    return node
  }

  append(...nodes: TestElement[]): void {
    nodes.forEach((node) => this.appendChild(node))
  }

  insertBefore(node: TestElement, before: TestElement): TestElement {
    const index = this.children.indexOf(before)
    if (index < 0) return this.appendChild(node)
    node.parentNode = this
    this.children.splice(index, 0, node)
    return node
  }

  removeChild(node: TestElement): TestElement {
    const index = this.children.indexOf(node)
    if (index >= 0) this.children.splice(index, 1)
    node.parentNode = null
    return node
  }

  contains(node: TestElement): boolean {
    return this === node || this.children.some((child) => child.contains(node))
  }

  closest(selector: string): TestElement | null {
    if (selector === '[data-fuxa-icon-pair-wrapper]'
        && this.getAttribute('data-fuxa-icon-pair-wrapper') !== null) return this
    return this.parentNode?.closest(selector) ?? null
  }

  getElementsByTagName(name: string): TestElement[] {
    const result: TestElement[] = []
    const visit = (node: TestElement): void => {
      for (const child of node.children) {
        if (name === '*' || child.localName === name) result.push(child)
        visit(child)
      }
    }
    visit(this)
    return result
  }
}

class TestDocument {
  readonly documentElement: TestElement

  constructor(root: TestElement) {
    this.documentElement = root
  }

  createElementNS(_namespace: string, name: string): TestElement {
    return new TestElement(name)
  }

  getElementsByTagName(name: string): TestElement[] {
    if (this.documentElement.localName === name || name === '*') {
      return [this.documentElement, ...this.documentElement.getElementsByTagName(name)]
    }
    return this.documentElement.getElementsByTagName(name)
  }
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

const floorFrame: FloorGroupFrameSettings = {
  fill: '#eff6ff',
  fillOpacity: 0.55,
  stroke: '#93c5fd',
  strokeWidth: 1,
  cornerRadius: 12,
  padding: 16,
}

function options(document: TestDocument): ApplyModelToViewOptions {
  let id = 0
  return {
    Parser: class {
      parseFromString(): XMLDocument {
        return document as unknown as XMLDocument
      }
    } as new () => SvgParser,
    serialize: () => '<svg serialized="yes"/>',
    allocateId: (prefix) => `${prefix}-${++id}`,
    resolveIcon: () => undefined,
    tags: { 'tag-1': { floor: '1F' } },
    floorGroupFrame: floorFrame,
  }
}

function view(items: Record<string, unknown> = {}): ApplyModelView {
  return {
    id: 'view-1',
    name: 'Main',
    svgcontent: '<svg/>',
    items,
  }
}

function model(components: ApplyModel['components'] = []): ApplyModel {
  return {
    components,
    grid,
    floorTitles: {},
    floorTitleIds: {},
    floorFrames: {},
    floorFrameIds: {},
    floorFrameShapeIds: {},
  }
}

describe('applyModelToView', () => {
  it('rebuilds managed SVG, floor artifacts, and FUXA items while retaining unknown fields', () => {
    const root = new TestElement('svg')
    const layer = root.appendChild(new TestElement('g', { id: 'layer-1' }))
    layer.appendChild(new TestElement('rect', { id: 'shape-1' }))
    layer.appendChild(new TestElement('text', { id: 'label-1' }))
    const userNode = layer.appendChild(new TestElement('circle', { id: 'user-node' }))
    const doc = new TestDocument(root)
    const managedComponent = component()
    const currentView = view({
      'shape-1': {
        id: 'shape-1',
        customItemField: 'keep',
        property: { events: [{ id: 'event-1' }], customProperty: true },
      },
      'label-1': { id: 'label-1', customLabelField: true },
      'user-item': { id: 'user-item', name: 'unmanaged' },
    })
    const currentModel = model([managedComponent])
    currentModel.originalComponents = [managedComponent]

    applyModelToView(currentView, currentModel, options(doc))

    expect(currentView.svgcontent).toBe('<svg serialized="yes"/>')
    expect(currentView.items['shape-1']).toMatchObject({
      customItemField: 'keep',
      type: 'svg-ext-shapes-rectangle',
      property: {
        customProperty: true,
        events: [{ id: 'event-1' }],
        variableId: 'tag-1',
      },
    })
    expect(currentView.items['label-1']).toMatchObject({ customLabelField: true })
    expect(currentView.items['user-item']).toEqual({ id: 'user-item', name: 'unmanaged' })
    expect(currentModel.floorTitles['floor:1F']).toBe('svg-3')
    expect(currentModel.floorFrames['floor:1F']).toBe('svg-1')
    expect(currentModel.floorFrameShapeIds['floor:1F']).toBe('SHE-2')
    expect(currentModel.floorTitleIds['floor:1F']).toEqual(['svg-3'])
    expect(currentModel.floorFrameIds['floor:1F']).toEqual(['svg-1'])
    expect(layer.children.includes(userNode)).toBe(true)
    expect(layer.children.map((node) => node.getAttribute('data-name'))).toContain(
      'fuxa_floor_section_title',
    )
    expect(layer.children.some((node) => node.getAttribute('id') === 'shape-1')).toBe(true)
  })

  it('declares XLink namespace for icon-based components', () => {
    const root = new TestElement('svg')
    root.appendChild(new TestElement('g'))
    const doc = new TestDocument(root)
    const iconComponent = component({
      template: 'icon',
      iconId: 'icon-1',
    })

    expect(() => applyModelToView(view(), model([iconComponent]), {
      ...options(doc),
      resolveIcon: () => ({
        id: 'icon-1',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,AA==',
      }),
    })).not.toThrow()
    expect(root.getAttribute('xmlns:xlink')).toBe('http://www.w3.org/1999/xlink')
  })

  it('fails without altering the view when no SVG insertion layer exists', () => {
    const doc = new TestDocument(new TestElement('svg'))
    const currentView = view()
    const before = structuredClone(currentView)
    expect(() => applyModelToView(currentView, model(), options(doc)))
      .toThrow('View「Main」找不到可安全插入元件的 SVG 圖層。')
    expect(currentView).toEqual(before)
  })

  it('does not commit view or model changes when component generation fails', () => {
    const root = new TestElement('svg')
    root.appendChild(new TestElement('g'))
    const doc = new TestDocument(root)
    const currentView = view({ 'user-item': { id: 'user-item', custom: true } })
    const iconComponent = component({
      template: 'icon',
      iconId: 'missing-icon',
    })
    const currentModel = model([iconComponent])
    const previousView = structuredClone(currentView)
    const previousModel = structuredClone(currentModel)
    const opts = options(doc)

    expect(() => applyModelToView(currentView, currentModel, {
      ...opts,
      resolveIcon: () => undefined,
    })).toThrow('元件「Pump」使用的圖示不存在。')

    expect(currentView).toEqual(previousView)
    expect(currentModel).toEqual(previousModel)
  })
})
