import { describe, expect, it } from 'vitest'
import { ensureXlinkNamespace } from '../../src/domain/svg/ensureXlinkNamespace'

describe('ensureXlinkNamespace', () => {
  it('sets the xlink namespace on the SVG root', () => {
    const attributes = new Map<string, string>()
    const doc = {
      documentElement: {
        setAttributeNS(namespace: string, name: string, value: string) {
          attributes.set(`${namespace}:${name}`, value)
        },
      },
    } as unknown as XMLDocument

    ensureXlinkNamespace(doc)

    expect(attributes.get(
      'http://www.w3.org/2000/xmlns/:xmlns:xlink',
    )).toBe('http://www.w3.org/1999/xlink')
  })

  it('does nothing if the document has no root element', () => {
    expect(() => ensureXlinkNamespace({
      documentElement: null,
    } as unknown as XMLDocument)).not.toThrow()
  })
})
