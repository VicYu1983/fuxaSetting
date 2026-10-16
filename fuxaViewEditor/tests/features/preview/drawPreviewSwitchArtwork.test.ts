import { describe, expect, it } from 'vitest'
import { layoutFloorComponents } from '../../../src/domain/layout/floorLayout'
import { drawPreviewSwitchArtwork } from '../../../src/features/preview/drawPreviewSwitchArtwork'

class TestElement {
  readonly attributes: Record<string, string> = {}
  readonly children: TestElement[] = []
  readonly localName: string
  readonly ownerDocument: TestDocument

  constructor(localName: string, ownerDocument: TestDocument) {
    this.localName = localName
    this.ownerDocument = ownerDocument
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  appendChild(child: TestElement): TestElement {
    this.children.push(child)
    return child
  }
}

class TestDocument {
  createElementNS(_namespace: string, name: string): TestElement {
    return new TestElement(name, this)
  }
}

describe('drawPreviewSwitchArtwork', () => {
  it('draws switch artwork only for managed switches', () => {
    const layout = layoutFloorComponents([
      { key: 'managed-switch', tagId: 'tag-1', template: 'switch' },
      { key: 'rectangle', tagId: 'tag-2', template: 'rect' },
      { key: 'existing-switch', tagId: 'tag-3', template: 'switch', managed: false },
    ], { columns: 3, originX: 20, originY: 30 }, new Map())
    const doc = new TestDocument()
    const layer = new TestElement('g', doc)

    drawPreviewSwitchArtwork(
      layer as unknown as Element,
      layout.placements,
    )

    expect(layer.children).toHaveLength(1)
    expect(layer.children[0]?.attributes).toMatchObject({
      'data-preview-only': 'switch',
      'pointer-events': 'none',
    })
    expect(layer.children[0]?.children.map((child) => child.localName))
      .toEqual(['rect', 'circle'])
    const shape = layout.placements[0]!.placement.shape
    expect(layer.children[0]?.children[0]?.attributes).toMatchObject({
      x: String(shape.x + 9),
      y: String(shape.y + 7),
      fill: '#bdbdbd',
    })
    expect(layer.children[0]?.children[1]?.attributes).toMatchObject({
      cx: String(shape.x + 17),
      cy: String(shape.y + 14),
      fill: '#ffffff',
    })
  })
})
