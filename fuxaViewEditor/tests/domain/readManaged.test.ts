import { describe, expect, it } from 'vitest'
import { readManaged } from '../../src/domain/svg/readManaged'
import type { SvgParser } from '../../src/domain/svg/parseSvg'

class SvgElement {
  readonly localName: string
  readonly namespaceURI = 'http://www.w3.org/2000/svg'
  readonly attributes: Record<string, string>
  readonly textContent: string
  readonly children: SvgElement[]
  parentElement: SvgElement | null = null

  constructor(
    localName: string,
    attributes: Record<string, string> = {},
    textContent = '',
    children: SvgElement[] = [],
  ) {
    this.localName = localName
    this.attributes = attributes
    this.textContent = textContent
    this.children = children
    for (const child of children) child.parentElement = this
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  querySelector(selector: string): SvgElement | null {
    for (const child of this.children) {
      if (selector === '[id]' && child.getAttribute('id')) return child
      if (selector === 'image[data-fuxa-icon-id]'
          && child.localName === 'image'
          && child.getAttribute('data-fuxa-icon-id')) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }

  querySelectorAll(selector: string): SvgElement[] {
    const matches: SvgElement[] = []
    const visit = (node: SvgElement): void => {
      for (const child of node.children) {
        if (selector === '[id]' && child.getAttribute('id')) matches.push(child)
        visit(child)
      }
    }
    visit(this)
    return matches
  }

  getElementsByTagName(name: string): SvgElement[] {
    const result: SvgElement[] = []
    const visit = (node: SvgElement): void => {
      if (name === '*' || node.localName === name) result.push(node)
      node.children.forEach(visit)
    }
    visit(this)
    return result
  }
}

function parserFor(doc: XMLDocument): new () => SvgParser {
  return class {
    parseFromString() {
      return doc
    }
  }
}

function documentOf(root: SvgElement): XMLDocument {
  return {
    documentElement: root,
    getElementsByTagName(name: string) {
      if (name === 'parsererror') return []
      return root.getElementsByTagName(name)
    },
  } as unknown as XMLDocument
}

describe('readManaged', () => {
  it('combines floor artifacts, managed records, and movable existing Tags', () => {
    const root = new SvgElement('svg', {}, '', [
      new SvgElement('text', {
        id: 'floor-title',
        x: '10',
        y: '20',
        'data-floor-group': '1F',
      }, '1F'),
      new SvgElement('g', {
        id: 'floor-frame',
        'data-floor-group': '1F',
      }, '', [new SvgElement('rect', { id: 'frame-shape' })]),
      new SvgElement('rect', { id: 'managed-shape' }),
      new SvgElement('text', { id: 'managed-label' }, 'Managed Tag'),
      new SvgElement('circle', { id: 'existing-tag' }),
    ])
    const doc = documentOf(root)
    const result = readManaged({
      id: 'view-1',
      svgcontent: '<svg/>',
      items: {
        'floor-title': { id: 'floor-title', name: 'fuxa_floor_section_title' },
        'floor-frame': { id: 'floor-frame', name: 'fuxa_floor_section_frame' },
        'managed-shape': {
          id: 'managed-shape',
          name: 'tc_1',
          type: 'svg-ext-shapes-select',
          property: { variableId: 'managed-tag' },
        },
        'managed-label': {
          id: 'managed-label',
          name: 'tc_1_label',
          type: 'svg-ext-shapes-text',
        },
        'existing-tag': {
          id: 'existing-tag',
          name: 'Existing tag',
          type: 'svg-ext-shapes-select',
          property: { variableId: 'existing-id' },
        },
      },
    }, parserFor(doc))

    expect(result.error).toBeUndefined()
    expect(result.records).toMatchObject([{
      seq: 1,
      tagId: 'managed-tag',
      label: 'Managed Tag',
      shapeId: 'managed-shape',
      labelId: 'managed-label',
    }])
    expect(result.floorTitles).toEqual({ 'floor:1F': 'floor-title' })
    expect(result.floorFrames).toEqual({ 'floor:1F': 'floor-frame' })
    expect(result.floorFrameShapeIds).toEqual({ 'floor:1F': 'frame-shape' })
    expect(result.movableTags).toMatchObject([{
      id: 'existing-tag',
      name: 'Existing tag',
      tagId: 'existing-id',
      nodeName: 'circle',
      reason: '',
    }])
    expect(result.unmanaged).toEqual([])
    expect(result.doc).toBe(doc)
  })

  it('returns established error shape for invalid View and invalid SVG', () => {
    const validDoc = documentOf(new SvgElement('svg'))
    expect(readManaged({}, parserFor(validDoc))).toEqual({
      records: [],
      unmanaged: [],
      movableTags: [],
      error: 'View 缺少 items 或 svgcontent。',
    })

    const errorDoc = {
      documentElement: new SvgElement('html'),
      getElementsByTagName() {
        return []
      },
    } as unknown as XMLDocument
    const invalid = readManaged({
      items: {},
      svgcontent: '<html/>',
    }, parserFor(errorDoc))
    expect(invalid).toEqual({
      records: [],
      unmanaged: [],
      movableTags: [],
      error: 'View 的 svgcontent 無法解析。',
    })
  })
})
