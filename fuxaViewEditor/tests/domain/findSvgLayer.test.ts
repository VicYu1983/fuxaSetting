import { describe, expect, it } from 'vitest'
import { findSvgLayer } from '../../src/domain/svg/findSvgLayer'

class TestElement {
  readonly localName: string
  readonly children: TestElement[]
  readonly titles: TestElement[]
  readonly textContent: string

  constructor(
    localName: string,
    children: TestElement[] = [],
    titles: TestElement[] = [],
    textContent = '',
  ) {
    this.localName = localName
    this.children = children
    this.titles = titles
    this.textContent = textContent
  }

  getElementsByTagName(name: string): TestElement[] {
    return name === 'title' ? this.titles : []
  }
}

function documentOf(root: TestElement): XMLDocument {
  return { documentElement: root } as unknown as XMLDocument
}

describe('findSvgLayer', () => {
  it('prefers the direct child group titled Layer 1', () => {
    const firstLayer = new TestElement('g', [], [new TestElement('title', [], [], 'Layer 2')])
    const targetLayer = new TestElement('g', [], [new TestElement('title', [], [], 'Layer 1')])
    const result = findSvgLayer(documentOf(new TestElement('svg', [
      new TestElement('defs'),
      firstLayer,
      targetLayer,
    ])))
    expect(result).toBe(targetLayer)
  })

  it('falls back to the first direct child group and returns null without groups', () => {
    const fallback = new TestElement('g')
    expect(findSvgLayer(documentOf(new TestElement('svg', [
      new TestElement('defs'),
      fallback,
      new TestElement('g', [], [new TestElement('title')]),
    ])))).toBe(fallback)
    expect(findSvgLayer(documentOf(new TestElement('svg', [new TestElement('defs')]))))
      .toBeNull()
    expect(findSvgLayer({ documentElement: null } as unknown as XMLDocument)).toBeNull()
  })
})
