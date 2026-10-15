import { describe, expect, it } from 'vitest'
import { readMovableTags } from '../../src/domain/svg/readMovableTags'

class TestElement {
  readonly localName: string
  readonly namespaceURI: string
  readonly attributes: Record<string, string>
  parentElement: TestElement | null = null

  constructor(
    localName: string,
    attributes: Record<string, string> = {},
    namespaceURI = 'http://www.w3.org/2000/svg',
  ) {
    this.localName = localName
    this.attributes = attributes
    this.namespaceURI = namespaceURI
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }
}

function createDocument(elements: TestElement[]): XMLDocument {
  return {
    getElementsByTagName() {
      return elements
    },
  } as unknown as XMLDocument
}

describe('readMovableTags', () => {
  it('returns ordinary SVG Tag graphics as movable candidates and skips consumed items', () => {
    const svg = new TestElement('svg')
    const rect = new TestElement('rect', { id: 'tag-shape' })
    rect.parentElement = svg
    const doc = createDocument([svg, rect])
    const result = readMovableTags({
      'tag-shape': {
        name: 'Pump',
        type: 'svg-ext-shapes-select',
        property: { variableId: 'tag-pump' },
      },
      consumed: { property: { variableId: 'tag-consumed' } },
      notATag: { property: { other: 'value' } },
    }, doc, new Set(['consumed']))

    expect(result).toEqual({
      movableTags: [{
        id: 'tag-shape',
        name: 'Pump',
        tagId: 'tag-pump',
        type: 'svg-ext-shapes-select',
        nodeName: 'rect',
        reason: '',
      }],
      unmanaged: [],
    })
  })

  it('classifies missing IDs, duplicate IDs, and unsupported SVG elements as unmanaged', () => {
    const svg = new TestElement('svg')
    const firstDuplicate = new TestElement('circle', { id: 'duplicate' })
    const secondDuplicate = new TestElement('circle', { id: 'duplicate' })
    const script = new TestElement('script', { id: 'unsupported' })
    firstDuplicate.parentElement = svg
    secondDuplicate.parentElement = svg
    script.parentElement = svg
    const result = readMovableTags({
      missing: { property: { variableId: 'tag-missing' } },
      duplicate: { property: { variableId: 'tag-duplicate' } },
      unsupported: { property: { variableId: 'tag-unsupported' } },
    }, createDocument([svg, firstDuplicate, secondDuplicate, script]))

    expect(result.movableTags).toEqual([])
    expect(result.unmanaged.map(({ id, nodeName, reason }) => [id, nodeName, reason])).toEqual([
      ['missing', '', '找不到對應的 SVG 元件'],
      ['duplicate', 'circle', 'SVG 元件 ID 重複，無法安全辨識位置'],
      ['unsupported', 'script', '不支援移動 SVG script 元件'],
    ])
  })

  it('blocks non-SVG namespaces and arbitrary transforms', () => {
    const foreign = new TestElement('rect', { id: 'foreign' }, 'urn:foreign')
    const transformed = new TestElement('rect', { id: 'transformed', transform: 'rotate(45)' })
    const result = readMovableTags({
      foreign: { property: { variableId: 'tag-foreign' } },
      transformed: { property: { variableId: 'tag-transformed' } },
    }, createDocument([foreign, transformed]))

    expect(result.unmanaged.map(({ reason }) => reason)).toEqual([
      '不支援移動 SVG rect 元件',
      '元件已有 transform，為避免改變原有定位而不自動移動',
    ])
  })

  it('allows only recognized floor-layout transforms and blocks transformed ancestors', () => {
    const svg = new TestElement('svg')
    const floorLayoutShape = new TestElement('rect', {
      id: 'floor-shape',
      transform: 'translate(10 -20.5)',
      'data-fuxa-floor-layout': 'floor-layout-v1',
    })
    floorLayoutShape.parentElement = svg
    const arbitraryGroup = new TestElement('g', { transform: 'scale(2)' })
    arbitraryGroup.parentElement = svg
    const child = new TestElement('path', { id: 'child' })
    child.parentElement = arbitraryGroup

    const result = readMovableTags({
      'floor-shape': { property: { variableId: 'tag-floor' } },
      child: { property: { variableId: 'tag-child' } },
    }, createDocument([svg, floorLayoutShape, arbitraryGroup, child]))

    expect(result.movableTags.map(({ id }) => id)).toEqual(['floor-shape'])
    expect(result.unmanaged).toMatchObject([{
      id: 'child',
      reason: '上層 SVG 群組已有 transform，為避免改變原有定位而不自動移動',
    }])
  })
})
