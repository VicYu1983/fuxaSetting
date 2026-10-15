import { describe, expect, it } from 'vitest'
import { sanitizePreview } from '../../src/domain/svg/sanitizePreview'

interface FakeAttribute {
  name: string
  value: string
}

function makeElement(
  localName: string,
  values: Record<string, string> = {},
): Element {
  const attributes: FakeAttribute[] = Object.entries(values)
    .map(([name, value]) => ({ name, value }))
  let connected = true
  const element = {
    localName,
    attributes,
    get isConnected() {
      return connected
    },
    remove() {
      connected = false
    },
    removeAttribute(name: string) {
      const index = attributes.findIndex((attribute) => attribute.name === name)
      if (index >= 0) attributes.splice(index, 1)
    },
    getAttribute(name: string) {
      return attributes.find((attribute) => attribute.name === name)?.value ?? null
    },
  }
  return element as unknown as Element
}

function makeDocument(elements: Element[]): XMLDocument {
  const root = elements[0]!
  return {
    documentElement: root,
    getElementsByTagName() {
      return elements.filter((element) => element.isConnected)
    },
  } as unknown as XMLDocument
}

describe('sanitizePreview', () => {
  it('removes executable elements, inline handlers, and unsafe links', () => {
    const root = makeElement('svg')
    const script = makeElement('script')
    const foreignObject = makeElement('foreignObject')
    const shape = makeElement('rect', {
      onload: 'alert(1)',
      onclick: 'alert(1)',
      href: ' https://example.com/image.svg ',
      'xlink:href': 'javascript:alert(1)',
      style: 'fill:url(https://example.com/a.svg#paint)',
      'xml:base': 'https://example.com/',
      fill: 'url(https://example.com/pattern.svg#fill)',
    })
    const doc = makeDocument([root, script, foreignObject, shape])

    sanitizePreview(doc)

    expect(script.isConnected).toBe(false)
    expect(foreignObject.isConnected).toBe(false)
    for (const name of [
      'onload',
      'onclick',
      'href',
      'xlink:href',
      'style',
      'xml:base',
      'fill',
    ]) {
      expect(shape.getAttribute(name)).toBeNull()
    }
  })

  it('keeps local fragment references and supported embedded raster images', () => {
    const root = makeElement('svg')
    const shape = makeElement('rect', {
      href: '#local-shape',
      fill: 'url(#local-gradient)',
      'xlink:href': 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==',
      src: 'data:image/png;base64,aGVsbG8=',
    })
    const doc = makeDocument([root, shape])

    sanitizePreview(doc)

    expect(shape.getAttribute('href')).toBe('#local-shape')
    expect(shape.getAttribute('fill')).toBe('url(#local-gradient)')
    expect(shape.getAttribute('xlink:href')).toContain('data:image/gif;base64,')
    expect(shape.getAttribute('src')).toContain('data:image/png;base64,')
  })

  it('removes unsupported embedded data and srcset attributes', () => {
    const root = makeElement('svg')
    const image = makeElement('image', {
      href: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=',
      srcset: 'data:image/png;base64,aGVsbG8= 1x',
    })

    sanitizePreview(makeDocument([root, image]))

    expect(image.getAttribute('href')).toBeNull()
    expect(image.getAttribute('srcset')).toBeNull()
  })
})
