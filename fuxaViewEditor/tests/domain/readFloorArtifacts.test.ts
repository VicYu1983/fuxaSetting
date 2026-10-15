import { describe, expect, it } from 'vitest'
import { readFloorArtifacts } from '../../src/domain/svg/readFloorArtifacts'

class TestElement {
  readonly localName: string
  readonly attributes: Record<string, string>
  readonly textContent: string
  readonly children: TestElement[]

  constructor(
    localName: string,
    attributes: Record<string, string> = {},
    textContent = '',
    children: TestElement[] = [],
  ) {
    this.localName = localName
    this.attributes = attributes
    this.textContent = textContent
    this.children = children
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      if (selector === '[id]' && child.getAttribute('id')) return child
      if (selector === child.localName) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
}

function makeDocument(root: TestElement): XMLDocument {
  const allElements: TestElement[] = []
  const visit = (node: TestElement): void => {
    allElements.push(node)
    node.children.forEach(visit)
  }
  visit(root)
  return {
    getElementsByTagName() {
      return allElements
    },
  } as unknown as XMLDocument
}

describe('readFloorArtifacts', () => {
  it('groups floor titles and frames, retaining duplicate IDs and choosing canonical artifacts', () => {
    const root = new TestElement('svg', {}, '', [
      new TestElement('text', { id: 'title-old', x: '10', y: '20' }, '未設定樓層'),
      new TestElement('text', {
        id: 'title-new', x: '10', y: '20', 'data-floor-group': '',
      }, '未設定樓層'),
      new TestElement('g', { id: 'frame-old' }, '', [
        new TestElement('rect', { id: 'shape-old', x: '0', y: '0', width: '100', height: '100' }),
      ]),
      new TestElement('g', { id: 'frame-new', 'data-floor-group': '' }, '', [
        new TestElement('rect', { id: 'shape-new', x: '0', y: '0', width: '100', height: '100' }),
      ]),
    ])
    const result = readFloorArtifacts({
      'title-old': { name: 'fuxa_floor_section_title' },
      'title-new': { name: 'fuxa_floor_section_title' },
      'frame-old': { name: 'fuxa_floor_section_frame' },
      'frame-new': { name: 'fuxa_floor_section_frame' },
    }, makeDocument(root))

    expect(result.floorTitleIds['floor:']).toEqual(['title-old', 'title-new'])
    expect(result.floorFrameIds['floor:']).toEqual(['frame-new', 'frame-old'])
    expect(result.floorTitles['floor:']).toBe('title-old')
    expect(result.floorFrames['floor:']).toBe('frame-new')
    expect(result.floorFrameShapeIds['floor:']).toBe('shape-new')
    expect([...result.consumed]).toEqual(['title-old', 'title-new', 'frame-old', 'frame-new'])
  })

  it('prioritizes configured artifact IDs and finds inner frame shape IDs', () => {
    const root = new TestElement('svg', {}, '', [
      new TestElement('text', { id: 'title-old', x: '10', y: '20' }, '未設定樓層'),
      new TestElement('text', {
        id: 'title-new', x: '10', y: '20', 'data-floor-group': '',
      }, '未設定樓層'),
      new TestElement('g', { id: 'frame-old' }, '', [
        new TestElement('rect', { id: 'shape-old' }),
      ]),
      new TestElement('g', { id: 'frame-new' }, '', [
        new TestElement('rect', { id: 'shape-new' }),
      ]),
    ])
    const result = readFloorArtifacts({
      'title-old': { name: 'fuxa_floor_section_title' },
      'title-new': { name: 'fuxa_floor_section_title' },
      'frame-old': { name: 'fuxa_floor_section_frame' },
      'frame-new': { name: 'fuxa_floor_section_frame' },
    }, makeDocument(root), {
      'floor:': {
        titleId: 'title-new',
        frameId: 'frame-new',
        frameShapeId: 'shape-new',
      },
    })

    expect(result.floorTitles['floor:']).toBe('title-new')
    expect(result.floorFrames['floor:']).toBe('frame-new')
    expect(result.floorFrameShapeIds['floor:']).toBe('shape-new')
  })
})
