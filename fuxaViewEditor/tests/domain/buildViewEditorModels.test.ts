import { describe, expect, it, vi } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import { buildViewEditorModels } from '../../src/domain/views/buildViewEditorModels'

function config(views: unknown[]): FuxaConfig {
  return { devices: {}, hmi: { views } }
}

describe('buildViewEditorModels', () => {
  it('keeps Views with invalid SVG read-only and reports the parser error', () => {
    class Parser {
      parseFromString() {
        return {
          documentElement: { localName: 'html' },
          getElementsByTagName: () => [],
        } as unknown as XMLDocument
      }
    }
    const measureBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
    const result = buildViewEditorModels(config([{
      id: 'view-1',
      svgcontent: '<html/>',
      items: {},
    }]), Parser, measureBounds)

    expect(result.models.size).toBe(0)
    expect(result.errors.get('view-1')).toBe('View 的 svgcontent 無法解析。')
    expect(measureBounds).not.toHaveBeenCalled()
  })

  it('marks duplicate View IDs as non-editable instead of choosing one arbitrarily', () => {
    class Parser {
      parseFromString(): XMLDocument {
        throw new Error('Parser should not be called for duplicate IDs.')
      }
    }
    const result = buildViewEditorModels(config([
      { id: 'duplicate', svgcontent: '<svg/>', items: {} },
      { id: 'duplicate', svgcontent: '<svg/>', items: {} },
    ]), Parser, () => ({ x: 0, y: 0, width: 10, height: 10 }))

    expect(result.models.has('duplicate')).toBe(false)
    expect(result.errors.get('duplicate'))
      .toBe('配置中 View ID「duplicate」重複，為避免匯出錯誤，此 View 設為唯讀。')
  })

  it('creates an editable baseline model for valid Views', () => {
    class Parser {
      parseFromString(): XMLDocument {
        return {
          documentElement: { localName: 'svg' },
          getElementsByTagName: () => [],
        } as unknown as XMLDocument
      }
    }
    const result = buildViewEditorModels(config([{
      id: 'view-1',
      svgcontent: '<svg/>',
      items: {},
    }]), Parser, () => ({ x: 0, y: 0, width: 10, height: 10 }))

    expect(result.errors.size).toBe(0)
    expect(result.models.get('view-1')).toMatchObject({
      viewId: 'view-1',
      components: [],
      originalComponents: [],
      floorTitles: {},
      floorFrames: {},
      floorFrameShapeIds: {},
    })
  })

  it('marks Views without IDs as read-only without parsing them', () => {
    class Parser {
      parseFromString(): XMLDocument {
        throw new Error('A view without an ID must not be parsed for editing.')
      }
    }
    const result = buildViewEditorModels(config([
      { svgcontent: '<svg/>', items: {} },
    ]), Parser, () => ({ x: 0, y: 0, width: 10, height: 10 }))

    expect(result.models.size).toBe(0)
    expect(result.errors.get(''))
      .toBe('此 View 缺少有效 ID，為避免修改錯誤的 View，已設為唯讀。')
  })
})
