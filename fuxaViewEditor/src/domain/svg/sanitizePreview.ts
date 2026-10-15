const BLOCKED_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'style',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'source',
  'link',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'discard',
])

const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|gif);base64,[a-z0-9+/]+={0,2}$/i
const EXTERNAL_URL_REFERENCE = /url\(\s*(['"]?)(?!#)/i

function isSafeReference(name: string, value: string): boolean {
  const normalized = value.trim()
  if (normalized.startsWith('#')) return true
  return (name === 'href' || name === 'xlink:href' || name === 'src')
    && IMAGE_DATA_URL.test(normalized)
}

export function sanitizePreview(doc: XMLDocument): void {
  const elements = Array.from(doc.getElementsByTagName('*'))
  for (const element of elements) {
    if (BLOCKED_ELEMENTS.has(element.localName.toLowerCase())) element.remove()
  }

  for (const element of elements) {
    if (!element.isConnected && element !== doc.documentElement) continue
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      const normalizedValue = Array.from(value)
        .filter((character) => character.charCodeAt(0) > 0x20)
        .join('')
        .toLowerCase()
      const isReference = name === 'href' || name === 'xlink:href' || name === 'src'
      if (
        name.startsWith('on')
        || name === 'style'
        || name === 'srcset'
        || name === 'xml:base'
        || (isReference && !isSafeReference(name, value))
        || normalizedValue.startsWith('javascript:')
        || EXTERNAL_URL_REFERENCE.test(value)
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  }
}
