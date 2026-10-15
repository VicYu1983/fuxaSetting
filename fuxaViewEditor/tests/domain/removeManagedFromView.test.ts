import { describe, expect, it } from 'vitest'
import { removeManagedFromView } from '../../src/domain/svg/removeManagedFromView'

class TestElement {
  readonly attributes: Record<string, string>
  readonly children: TestElement[] = []
  parentNode: TestElement | null = null

  constructor(attributes: Record<string, string> = {}) {
    this.attributes = attributes
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  appendChild(child: TestElement): TestElement {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  removeChild(child: TestElement): TestElement {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    child.parentNode = null
    return child
  }

  closest(selector: string): TestElement | null {
    if (selector === '[data-fuxa-icon-pair-wrapper]'
        && this.getAttribute('data-fuxa-icon-pair-wrapper') !== null) return this
    return this.parentNode?.closest(selector) ?? null
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
    getElementsByTagName(name: string) {
      if (name === '*') return root.getElementsByTagName()
      return []
    },
  } as unknown as XMLDocument
}

describe('removeManagedFromView', () => {
  it('removes managed shapes, labels, icon wrappers, and floor artifacts only', () => {
    const root = new TestElement()
    const layer = root.appendChild(new TestElement())
    const normalIconPair = layer.appendChild(new TestElement({
      'data-fuxa-icon-pair-wrapper': 'true',
    }))
    normalIconPair.appendChild(new TestElement({ id: 'alarm-id' }))
    layer.appendChild(new TestElement({ id: 'shape-id' }))
    layer.appendChild(new TestElement({ id: 'label-id' }))
    layer.appendChild(new TestElement({
      id: 'floor-title',
      'data-name': 'fuxa_floor_section_title',
    }))
    layer.appendChild(new TestElement({
      id: 'floor-frame',
      'data-name': 'fuxa_floor_section_frame',
    }))
    const userSvgNode = layer.appendChild(new TestElement({ id: 'user-svg' }))
    const doc = documentOf(root)
    const view = {
      items: {
        'shape-id': { name: 'managed' },
        'alarm-id': { name: 'alarm' },
        'label-id': { name: 'label' },
        'floor-title': { name: 'fuxa_floor_section_title' },
        'floor-frame': { name: 'fuxa_floor_section_frame' },
        'other-item': { name: 'other' },
      },
    }

    removeManagedFromView(view, {
      originalComponents: [{
        managed: true,
        shapeId: 'shape-id',
        alarmShapeId: 'alarm-id',
        labelId: 'label-id',
      }],
      components: [],
    }, doc)

    expect(layer.children).toEqual([userSvgNode])
    expect(view.items).toEqual({ 'other-item': { name: 'other' } })
  })

  it('does not remove unmanaged model components or their items', () => {
    const root = new TestElement()
    const layer = root.appendChild(new TestElement())
    const userTag = layer.appendChild(new TestElement({ id: 'tag-id' }))
    const view = { items: { 'tag-id': { name: 'existing-tag' } } }

    removeManagedFromView(view, {
      components: [{ managed: false, shapeId: 'tag-id' }],
    }, documentOf(root))

    expect(layer.children).toEqual([userTag])
    expect(view.items).toEqual({ 'tag-id': { name: 'existing-tag' } })
  })

  it('removes IDs saved only in duplicate floor artifact indexes', () => {
    const root = new TestElement()
    const layer = root.appendChild(new TestElement())
    layer.appendChild(new TestElement({ id: 'duplicate-title' }))
    const view = { items: { 'duplicate-title': { name: 'title' } } }

    removeManagedFromView(view, {
      originalFloorTitleIds: { 'floor:1F': ['duplicate-title'] },
    }, documentOf(root))

    expect(layer.children).toEqual([])
    expect(view.items).toEqual({})
  })
})
