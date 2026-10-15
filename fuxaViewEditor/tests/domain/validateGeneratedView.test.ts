import { describe, expect, it } from 'vitest'
import type { FloorGroupFrameSettings, GridSettings } from '../../src/domain/config/types'
import { validateGeneratedView, validateGeneratedViews } from '../../src/domain/svg/validateGeneratedView'
import type {
  GeneratedView,
  GeneratedViewModel,
} from '../../src/domain/svg/validateGeneratedView'
import type { SvgParser } from '../../src/domain/svg/parseSvg'

class TestElement {
  readonly localName: string
  readonly attributes: Record<string, string>
  readonly children: TestElement[] = []
  parentNode: TestElement | null = null
  textContent: string

  constructor(
    localName: string,
    attributes: Record<string, string> = {},
    textContent = '',
  ) {
    this.localName = localName
    this.attributes = { ...attributes }
    this.textContent = textContent
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  hasAttribute(name: string): boolean {
    return Object.hasOwn(this.attributes, name)
  }

  appendChild(child: TestElement): TestElement {
    child.parentNode = this
    this.children.push(child)
    return child
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

  getElementsByTagName(name: string): TestElement[] {
    if (name === '*' || this.documentElement.localName === name) {
      return [this.documentElement, ...this.documentElement.getElementsByTagName(name)]
    }
    return this.documentElement.getElementsByTagName(name)
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

function parserFor(doc: TestDocument | TestElement): new () => SvgParser {
  return class {
    parseFromString(): XMLDocument {
      const document = doc instanceof TestDocument ? doc : new TestDocument(doc)
      return document as unknown as XMLDocument
    }
  }
}

function makeModel(components: GeneratedViewModel['components'] = []): GeneratedViewModel {
  return {
    viewId: 'view-1',
    components,
    grid,
    floorGroupFrame: floorFrame,
    floorTitles: { 'floor:1F': 'title-id' },
    floorTitleIds: { 'floor:1F': ['title-id'] },
    floorFrames: { 'floor:1F': 'frame-id' },
    floorFrameIds: { 'floor:1F': ['frame-id'] },
  }
}

function makeView(items: unknown): GeneratedView {
  return { id: 'view-1', name: 'Main', svgcontent: '<svg/>', items }
}

function validDocument(): TestDocument {
  const root = new TestElement('svg')
  const layer = root.appendChild(new TestElement('g'))
  layer.appendChild(new TestElement('g', { id: 'shape-id' }))
  layer.appendChild(new TestElement('text', { id: 'label-id' }, 'Pump'))
  layer.appendChild(new TestElement(
    'text',
    { id: 'title-id', 'data-floor-group': '1F' },
    '1F',
  ))
  layer.appendChild(new TestElement(
    'g',
    { id: 'frame-id', 'data-floor-group': '1F' },
  ))
  return new TestDocument(root)
}

function managedComponent(): GeneratedViewModel['components'][number] {
  return {
    key: 'component-1',
    seq: 1,
    tagId: 'tag-1',
    label: 'Pump',
    template: 'rect',
    palette: 'normal',
    shapeId: 'shape-id',
    labelId: 'label-id',
    managed: true,
  }
}

function validItems(): Record<string, unknown> {
  return {
    'shape-id': {
      id: 'shape-id',
      property: { variableId: 'tag-1' },
    },
    'label-id': { id: 'label-id', name: 'tc_1_label' },
    'title-id': { id: 'title-id', name: 'fuxa_floor_section_title' },
    'frame-id': { id: 'frame-id', name: 'fuxa_floor_section_frame' },
  }
}

describe('validateGeneratedView', () => {
  it('accepts a consistent generated component with matching floor artifacts', () => {
    expect(() => validateGeneratedView(
      makeView(validItems()),
      makeModel([managedComponent()]),
      { Parser: parserFor(validDocument()), tags: new Map([['tag-1', { floor: '1F' }]]) },
    )).not.toThrow()
  })

  it('rejects malformed item IDs and missing or mismatched Tag bindings', () => {
    const parser = parserFor(validDocument())
    const model = makeModel([managedComponent()])
    expect(() => validateGeneratedView(
      makeView({ ...validItems(), 'bad-key': { id: 'bad-value' } }),
      model,
      { Parser: parser, tags: { 'tag-1': { floor: '1F' } } },
    )).toThrow('存在不一致的 item id：bad-key')

    const items = validItems()
    items['shape-id'] = { id: 'shape-id', property: { variableId: 'wrong-tag' } }
    expect(() => validateGeneratedView(
      makeView(items),
      model,
      { Parser: parser, tags: { 'tag-1': { floor: '1F' } } },
    )).toThrow('元件 shape-id 的 Tag 連結與清單不一致。')
  })

  it('rejects a component linked to a Tag that does not exist', () => {
    const component = managedComponent()
    component.tagId = 'missing-tag'
    const items = validItems()
    items['shape-id'] = { id: 'shape-id', property: { variableId: 'missing-tag' } }
    expect(() => validateGeneratedView(
      makeView(items),
      makeModel([component]),
      { Parser: parserFor(validDocument()), tags: {} },
    )).toThrow('連結到不存在的 Tag：missing-tag')
  })

  it('rejects an icon pair that is not colocated or has an incomplete visibility rule', () => {
    const root = new TestElement('svg')
    const layer = root.appendChild(new TestElement('g'))
    layer.appendChild(new TestElement('image', {
      id: 'shape-id',
      x: '1',
      y: '2',
      width: '40',
      height: '40',
    }))
    layer.appendChild(new TestElement('image', {
      id: 'alarm-id',
      x: '1',
      y: '3',
      width: '40',
      height: '40',
    }))
    layer.appendChild(new TestElement('text', { id: 'label-id' }))
    const component = {
      ...managedComponent(),
      template: 'icon-pair' as const,
      alarmShapeId: 'alarm-id',
    }
    const items = validItems()
    items['alarm-id'] = { id: 'alarm-id', property: { actions: [] } }

    expect(() => validateGeneratedView(
      makeView(items),
      makeModel([component]),
      { Parser: parserFor(root), tags: { 'tag-1': { floor: '1F' } } },
    )).toThrow('正常／告警圖示未輸出為同層且重疊的獨立圖片。')
  })

  it('rejects deleted managed components that remain in the SVG and items', () => {
    const root = new TestElement('svg')
    const layer = root.appendChild(new TestElement('g'))
    layer.appendChild(new TestElement('g', { id: 'deleted-shape' }))
    const currentModel = makeModel([])
    currentModel.originalComponents = [{
      ...managedComponent(),
      shapeId: 'deleted-shape',
    }]
    currentModel.floorTitles = {}
    currentModel.floorTitleIds = {}
    currentModel.floorFrames = {}
    currentModel.floorFrameIds = {}
    const items = { 'deleted-shape': { id: 'deleted-shape' } }

    expect(() => validateGeneratedView(
      makeView(items),
      currentModel,
      { Parser: parserFor(root), tags: {} },
    )).toThrow('已刪除的元件 deleted-shape 仍留在輸出配置中。')
  })

  it('detects duplicate newly created SVG IDs across modified Views', () => {
    const firstRoot = new TestElement('svg')
    firstRoot.appendChild(new TestElement('g', { id: 'created-id' }))
    const views = [
      makeView({}),
      { ...makeView({}), id: 'view-2' },
    ]
    const models = [
      { ...makeModel([]), viewId: 'view-1' },
      { ...makeModel([]), viewId: 'view-2' },
    ]

    expect(() => validateGeneratedViews(
      views,
      new Set(['view-1', 'view-2']),
      models,
      {
        Parser: parserFor(firstRoot),
        tags: {},
        createdIds: new Set(['created-id']),
      },
    )).toThrow('新元件 ID created-id 在 SVG 中重複出現。')
  })
})
