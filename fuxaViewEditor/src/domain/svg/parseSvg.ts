export interface SvgParser {
  parseFromString(source: string, mimeType: 'image/svg+xml'): XMLDocument
}

export interface SvgParserConstructor {
  new(): SvgParser
}

export function parseSvg(svgText: string, Parser: SvgParserConstructor): XMLDocument {
  const doc = new Parser().parseFromString(svgText, 'image/svg+xml')
  if (
    doc.getElementsByTagName('parsererror').length > 0
    || !doc.documentElement
    || doc.documentElement.localName !== 'svg'
  ) {
    throw new Error('View 的 svgcontent 無法解析。')
  }
  return doc
}

export function findSvgElementById(doc: XMLDocument, id: string): Element | null {
  for (const element of Array.from(doc.getElementsByTagName('*'))) {
    if (element.getAttribute('id') === id) return element
  }
  return null
}
