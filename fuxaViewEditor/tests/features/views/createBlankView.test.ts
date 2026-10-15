import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../../src/domain/config/types'
import type { SvgParser } from '../../../src/domain/svg/parseSvg'
import { createBlankView } from '../../../src/features/views/createBlankView'

function fakeParser(source: string): XMLDocument {
  const ids = Array.from(source.matchAll(/\bid="([^"]+)"/g), (match) => match[1]!)
  const elements = ids.map((id) => ({
    getAttribute(name: string) {
      return name === 'id' ? id : null
    },
  }))
  const root = {
    localName: 'svg',
    getAttribute() {
      return null
    },
  }
  return {
    documentElement: root,
    getElementsByTagName(name: string) {
      if (name === 'parsererror') return []
      if (name === '*') return [root, ...elements]
      return []
    },
  } as unknown as XMLDocument
}

class TestParser implements SvgParser {
  parseFromString(source: string, mimeType: 'image/svg+xml'): XMLDocument {
    if (mimeType !== 'image/svg+xml') throw new Error('Unexpected MIME type')
    return fakeParser(source)
  }
}

describe('createBlankView', () => {
  it('uses unique IDs, copies canvas dimensions, and escapes the title as SVG text', () => {
    const config: FuxaConfig = {
      devices: {},
      hmi: {
        views: [
          {
            id: 'v_01010101-010101010101',
            name: 'Existing',
            profile: { width: 1280, height: 720, bkcolor: '#123456ff' },
            items: { existingTitle: { name: 'view_title' } },
            svgcontent: '<svg xmlns="http://www.w3.org/2000/svg" id="existingSvg"></svg>',
          },
        ],
      },
    }
    let sequence = 1

    const result = createBlankView(config, '<New & Safe>', 'v_01010101-010101010101', {
      Parser: TestParser,
      serialize: () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      crypto: {
        getRandomValues(bytes) {
          bytes.fill(sequence)
          sequence += 1
          return bytes
        },
      },
    })

    expect(result.view.id).not.toBe('v_01010101-010101010101')
    expect(result.titleId).not.toBe('existingTitle')
    expect(result.titleId).not.toBe('existingSvg')
    expect(result.view.name).toBe('<New & Safe>')
    expect(result.view.profile).toMatchObject({
      width: 1280,
      height: 720,
      bkcolor: '#123456ff',
    })
    expect(result.view.items).toHaveProperty(result.titleId)
  })

  it('fails explicitly when an existing view SVG cannot be scanned safely', () => {
    const config: FuxaConfig = {
      devices: {},
      hmi: {
        views: [{
          id: 'existing',
          name: 'Broken',
          svgcontent: 'not-svg',
        }],
      },
    }
    class BrokenParser implements SvgParser {
      parseFromString() {
        return {
          documentElement: { localName: 'html' },
          getElementsByTagName() {
            return []
          },
        } as unknown as XMLDocument
      }
    }

    expect(() => createBlankView(config, 'New', '', {
      Parser: BrokenParser,
      serialize: () => '',
      crypto: { getRandomValues: (bytes) => bytes },
    })).toThrow('無法安全新增 View：View「Broken」的 SVG ID 無法檢查')
  })
})
