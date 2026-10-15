import { describe, expect, it } from 'vitest'
import type { FloorLayoutSection } from '../../src/domain/layout/floorLayout'
import { insertFloorFrame } from '../../src/domain/svg/insertFloorFrame'

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

  appendChild(node: TestElement): TestElement {
    node.parentNode = this
    this.children.push(node)
    return node
  }

  insertBefore(node: TestElement, before: TestElement): TestElement {
    const index = this.children.indexOf(before)
    if (index < 0) return this.appendChild(node)
    node.parentNode = this
    this.children.splice(index, 0, node)
    return node
  }

  contains(node: TestElement): boolean {
    return this === node || this.children.some((child) => child.contains(node))
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

function section(entries: FloorLayoutSection['entries']): FloorLayoutSection {
  return {
    floor: '1F',
    title: '1F',
    titleY: 0,
    x: 0,
    frame: { x: 0, y: 0, width: 100, height: 100 },
    entries,
  }
}

describe('insertFloorFrame', () => {
  it('inserts a frame before the first direct child containing an unmanaged Tag', () => {
    const root = new TestElement()
    const layer = root.appendChild(new TestElement())
    const unrelated = layer.appendChild(new TestElement({ id: 'background' }))
    const wrapper = layer.appendChild(new TestElement({ id: 'tag-wrapper' }))
    const tag = wrapper.appendChild(new TestElement({ id: 'tag-shape' }))
    const companion = wrapper.appendChild(new TestElement({ id: 'tag-label' }))
    const frame = new TestElement({ id: 'frame' })

    insertFloorFrame(layer as unknown as HTMLElement, frame as unknown as Node, section([{
      component: {
        key: 'tag',
        tagId: 'tag-id',
        shapeId: 'tag-shape',
        managed: false,
        companions: [{ id: 'tag-label' }],
      },
      placement: {
        key: 'tag',
        shape: { x: 0, y: 0, width: 10, height: 10 },
        label: { x: 0, y: 0, anchor: 'start' },
      },
    }]), documentOf(root))

    expect(layer.children).toEqual([unrelated, frame, wrapper])
    expect(wrapper.children).toEqual([tag, companion])
  })

  it('appends the frame when there are no unmanaged Tag nodes in the section', () => {
    const root = new TestElement()
    const layer = root.appendChild(new TestElement())
    const earlier = layer.appendChild(new TestElement({ id: 'managed' }))
    const frame = new TestElement({ id: 'frame' })

    insertFloorFrame(layer as unknown as HTMLElement, frame as unknown as Node, section([{
      component: {
        key: 'managed',
        tagId: 'tag-id',
        shapeId: 'managed-shape',
        managed: true,
      },
      placement: {
        key: 'managed',
        shape: { x: 0, y: 0, width: 10, height: 10 },
        label: { x: 0, y: 0, anchor: 'start' },
      },
    }]), documentOf(root))

    expect(layer.children).toEqual([earlier, frame])
  })
})
