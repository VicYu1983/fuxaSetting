import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import type { SvgParser } from '../../src/domain/svg/parseSvg'
import {
  alignFloorFramesToCanvas,
  floorFramesNeedCanvasAlignment,
} from '../../src/domain/svg/alignFloorFramesToCanvas'
import {
  hasCurrentFloorFrameLayout,
  saveFloorFrameLayoutVersion,
} from '../../src/domain/layout/floorGroupFrame'

class TestElement {
  readonly children: TestElement[] = []
  parentNode: TestElement | null = null
  readonly localName: string
  readonly attributes: Record<string, string>

  constructor(
    localName: string,
    attributes: Record<string, string> = {},
  ) {
    this.localName = localName
    this.attributes = attributes
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  appendChild(child: TestElement): void {
    child.parentNode = this
    this.children.push(child)
  }

  getElementsByTagName(name: string): TestElement[] {
    return this.children.flatMap((child) => [
      ...(name === '*' || child.localName === name ? [child] : []),
      ...child.getElementsByTagName(name),
    ])
  }
}

class TestDocument {
  readonly documentElement: TestElement

  constructor(documentElement: TestElement) {
    this.documentElement = documentElement
  }

  getElementsByTagName(name: string): TestElement[] {
    return [
      ...(name === '*' || this.documentElement.localName === name
        ? [this.documentElement]
        : []),
      ...this.documentElement.getElementsByTagName(name),
    ]
  }
}

function createFrameDocument(viewId: string): {
  doc: TestDocument
  rectangles: TestElement[]
} {
  const root = new TestElement('svg', { 'data-view-id': viewId })
  const rectangles: TestElement[] = []
  for (const frameId of [`${viewId}-frame-1`, `${viewId}-frame-2`]) {
    const frame = new TestElement('g', { id: frameId })
    const rectangle = new TestElement('rect', {
      x: '30',
      y: '70',
      width: '500',
      height: '150',
      rx: '12',
    })
    frame.appendChild(rectangle)
    root.appendChild(frame)
    rectangles.push(rectangle)
  }
  return { doc: new TestDocument(root), rectangles }
}

function createConfig(): FuxaConfig {
  const views = [
    { id: 'small', width: 800 },
    { id: 'large', width: 1024 },
  ]
  return {
    devices: {},
    hmi: {
      views: views.map(({ id, width }) => ({
        id,
        name: id,
        profile: { width, height: 768 },
        svgcontent: `<svg data-view="${id}"/>`,
        items: {
          [`${id}-frame-1`]: { id: `${id}-frame-1`, name: 'fuxa_floor_section_frame' },
          [`${id}-frame-2`]: { id: `${id}-frame-2`, name: 'fuxa_floor_section_frame' },
        },
      })),
    },
    extra: { keep: true, fuxaSetting: { viewGrids: { small: { columns: 4 } } } },
  }
}

function createParser(documents: Map<string, TestDocument>): new () => SvgParser {
  return class implements SvgParser {
    parseFromString(source: string): XMLDocument {
      const match = source.match(/data-view="([^"]+)"/)
      const doc = match ? documents.get(match[1]!) : undefined
      if (!doc) throw new Error(`Unknown SVG: ${source}`)
      return doc as unknown as XMLDocument
    }
  }
}

describe('alignFloorFramesToCanvas', () => {
  it('migrates every existing frame to the canvas edges without changing its vertical geometry', () => {
    const config = createConfig()
    const small = createFrameDocument('small')
    const large = createFrameDocument('large')
    const Parser = createParser(new Map([
      ['small', small.doc],
      ['large', large.doc],
    ]))
    const serialize = (doc: XMLDocument): string =>
      `<svg data-view="${doc.documentElement.getAttribute('data-view-id')}"/>`

    expect(floorFramesNeedCanvasAlignment(config, Parser)).toBe(true)
    alignFloorFramesToCanvas(config, Parser, serialize)

    expect(small.rectangles.map(({ attributes }) => attributes)).toEqual([
      { x: '10', y: '70', width: '780', height: '150', rx: '12' },
      { x: '10', y: '70', width: '780', height: '150', rx: '12' },
    ])
    expect(large.rectangles.map(({ attributes }) => attributes)).toEqual([
      { x: '10', y: '70', width: '1004', height: '150', rx: '12' },
      { x: '10', y: '70', width: '1004', height: '150', rx: '12' },
    ])
    expect(config.hmi.views.map((view) => {
      if (typeof view !== 'object' || view === null) throw new Error('Expected View')
      return (view as Record<string, unknown>).svgcontent
    })).toEqual([
      '<svg data-view="small"/>',
      '<svg data-view="large"/>',
    ])
    expect(floorFramesNeedCanvasAlignment(config, Parser)).toBe(false)
  })

  it('persists a layout version while retaining sibling tool settings', () => {
    const config = createConfig()
    expect(hasCurrentFloorFrameLayout(config)).toBe(false)

    saveFloorFrameLayoutVersion(config)

    expect(hasCurrentFloorFrameLayout(config)).toBe(true)
    expect(config.extra).toEqual({
      keep: true,
      fuxaSetting: {
        viewGrids: { small: { columns: 4 } },
        floorFrameLayoutVersion: 1,
      },
    })
  })
})
