import { describe, expect, it } from 'vitest'
import type { ComponentPlacement } from '../../src/domain/layout/gridLayout'
import { applyExistingTagLayout } from '../../src/domain/svg/applyExistingTagLayout'

class TestElement {
  readonly attributes: Record<string, string>
  readonly children: TestElement[] = []
  parentNode: TestElement | null = null

  constructor(attributes: Record<string, string> = {}) {
    this.attributes = { ...attributes }
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  removeAttribute(name: string): void {
    delete this.attributes[name]
  }

  appendChild(child: TestElement): TestElement {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  getElementsByTagName(): TestElement[] {
    const result: TestElement[] = []
    const visit = (node: TestElement): void => {
      for (const child of node.children) {
        result.push(child)
        visit(child)
      }
    }
    visit(this)
    return result
  }
}

function documentOf(root: TestElement): XMLDocument {
  return {
    getElementsByTagName() {
      return root.getElementsByTagName()
    },
  } as unknown as XMLDocument
}

const placement: ComponentPlacement = {
  key: 'tag-1',
  shape: { x: 25, y: 45, width: 40, height: 40 },
  label: { x: 45, y: 35, anchor: 'middle' },
}

describe('applyExistingTagLayout', () => {
  it('applies a common position transform to the Tag and its companions', () => {
    const root = new TestElement()
    const layer = root.appendChild(new TestElement())
    const tag = layer.appendChild(new TestElement({ id: 'tag-shape' }))
    const label = layer.appendChild(new TestElement({ id: 'tag-label' }))

    applyExistingTagLayout(documentOf(root), {
      shapeId: 'tag-shape',
      originalBounds: { x: 10, y: 20 },
      companions: [{ id: 'tag-label' }],
    }, placement)

    expect(tag.attributes).toEqual({
      id: 'tag-shape',
      transform: 'translate(15 25)',
      'data-fuxa-floor-layout': 'floor-layout-v1',
    })
    expect(label.attributes).toEqual({
      id: 'tag-label',
      transform: 'translate(15 25)',
      'data-fuxa-floor-layout': 'floor-layout-v1',
    })
  })

  it('removes an old floor-layout transform when no movement is needed', () => {
    const root = new TestElement()
    const tag = root.appendChild(new TestElement({
      id: 'tag-shape',
      transform: 'translate(5 5)',
      'data-fuxa-floor-layout': 'floor-layout-v1',
    }))

    applyExistingTagLayout(documentOf(root), {
      shapeId: 'tag-shape',
      originalBounds: { x: placement.shape.x, y: placement.shape.y },
    }, placement)

    expect(tag.attributes).toEqual({ id: 'tag-shape' })
  })

  it('reports a missing Tag or companion node', () => {
    const doc = documentOf(new TestElement())
    expect(() => applyExistingTagLayout(doc, {
      shapeId: 'missing-shape',
      originalBounds: { x: 0, y: 0 },
    }, placement)).toThrow('既有 Tag 元件 missing-shape 在 SVG 中不存在。')

    const root = new TestElement()
    root.appendChild(new TestElement({ id: 'tag-shape' }))
    expect(() => applyExistingTagLayout(documentOf(root), {
      shapeId: 'tag-shape',
      originalBounds: { x: 0, y: 0 },
      companions: [{ id: 'missing-label' }],
    }, placement)).toThrow('既有 Tag 標籤 missing-label 在 SVG 中不存在。')
  })
})
