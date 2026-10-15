import { describe, expect, it } from 'vitest'
import { findSvgElementById, parseSvg, type SvgParser } from '../../src/domain/svg/parseSvg'

function parserReturning(doc: XMLDocument): new () => SvgParser {
  return class {
    parseFromString() {
      return doc
    }
  }
}

function fakeDocument(
  localName: string,
  parserErrors: number,
  elements: Array<{ id: string | null }>,
): XMLDocument {
  const root = { localName }
  const nodes = elements.map((attributes) => ({
    getAttribute(name: string) {
      return name === 'id' ? attributes.id : null
    },
  }))
  const errorNodes = Array.from({ length: parserErrors }, () => ({}))
  return {
    documentElement: root,
    getElementsByTagName(name: string) {
      if (name === 'parsererror') return errorNodes
      return nodes
    },
  } as unknown as XMLDocument
}

describe('SVG parsing helpers', () => {
  it('parses only valid SVG documents and passes the SVG MIME type', () => {
    const doc = fakeDocument('svg', 0, [])
    let parsedText = ''
    let parsedMimeType = ''
    class Parser implements SvgParser {
      parseFromString(source: string, mimeType: 'image/svg+xml') {
        parsedText = source
        parsedMimeType = mimeType
        return doc
      }
    }

    expect(parseSvg('<svg/>', Parser)).toBe(doc)
    expect(parsedText).toBe('<svg/>')
    expect(parsedMimeType).toBe('image/svg+xml')
    expect(() => parseSvg('<html/>', parserReturning(fakeDocument('html', 0, []))))
      .toThrow('無法解析')
    expect(() => parseSvg('<invalid', parserReturning(fakeDocument('svg', 1, []))))
      .toThrow('無法解析')
  })

  it('finds the first element with the requested id or returns null', () => {
    const doc = fakeDocument('svg', 0, [{ id: 'one' }, { id: 'target' }, { id: 'target' }])
    const elements = Array.from(doc.getElementsByTagName('*'))
    expect(findSvgElementById(doc, 'target')).toBe(elements[1])
    expect(findSvgElementById(doc, 'missing')).toBeNull()
  })
})
