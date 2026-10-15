import { describe, expect, it, vi } from 'vitest'
import type { FuxaConfig, SourceTextFormat } from '../../src/domain/config/types'
import { prepareFuxaConfigExport } from '../../src/domain/config/prepareFuxaConfigExport'
import type {
  ExportViewModel,
  PrepareFuxaConfigExportInput,
} from '../../src/domain/config/prepareFuxaConfigExport'

const sourceFormat: SourceTextFormat = {
  lineEnding: '\r\n',
  hasTrailingNewline: true,
}

function config(): FuxaConfig {
  return {
    devices: {},
    hmi: {
      views: [
        { id: 'view-1', name: 'Main', items: {}, svgcontent: '<svg/>' },
        { id: 'view-2', name: 'Other', items: {}, svgcontent: '<svg/>' },
      ],
    },
    extra: { customField: { keep: true } },
  }
}

function model(viewId = 'view-1'): ExportViewModel {
  return {
    viewId,
    components: [],
    grid: {
      columns: 2,
      originX: 10,
      originY: 20,
      gapX: 5,
      gapY: 6,
      labelPosition: 'below',
      labelOffset: 3,
      labelFontSize: 12,
    },
    floorTitles: {},
    floorFrames: {},
    floorFrameShapeIds: {},
  }
}

function input(overrides: Partial<PrepareFuxaConfigExportInput> = {}): PrepareFuxaConfigExportInput {
  return {
    config: config(),
    originalText: '{\r\n  "raw": true\r\n}\r\n',
    sourceFormat,
    dirty: false,
    ...overrides,
  }
}

describe('prepareFuxaConfigExport', () => {
  it('returns the original JSON text and does not mutate config when unchanged', () => {
    const original = config()
    const result = prepareFuxaConfigExport(input({ config: original }))

    expect(result.text).toBe('{\r\n  "raw": true\r\n}\r\n')
    expect(result.config).toBe(original)
    expect(result.dirty).toBe(false)
    expect(result.modifiedViewIds.size).toBe(0)
    expect(original.extra).toEqual({ customField: { keep: true } })
  })

  it('applies selected Views, persists metadata, preserves unknown settings and source formatting', () => {
    const original = config()
    original.extra = {
      customField: { keep: true },
      fuxaSetting: {
        viewGrids: { 'view-2': { columns: 7 } },
        floorGroupArtifacts: {
          'view-2': {
            'floor:1F': { titleId: 'title-2', frameId: 'frame-2', frameShapeId: 'shape-2' },
          },
        },
        customSetting: 'preserve',
      },
    }
    const originalSnapshot = structuredClone(original)
    const currentModel = model()
    const applyView = vi.fn((view: Record<string, unknown>) => {
      view.applied = true
    })
    const validate = vi.fn()
    const result = prepareFuxaConfigExport(input({
      config: original,
      dirty: true,
      models: [currentModel],
      modifiedViewIds: new Set(['view-1']),
      floorGroupFrame: {
        fill: '#eff6ff',
        fillOpacity: 0.55,
        stroke: '#93c5fd',
        strokeWidth: 1,
        cornerRadius: 12,
        padding: 16,
      },
    }), { applyView, validate })

    expect(applyView).toHaveBeenCalledOnce()
    expect(validate).toHaveBeenCalledOnce()
    expect(result.modifiedViewIds).toEqual(new Set(['view-1']))
    expect(result.config).not.toBe(original)
    expect(original).toEqual(originalSnapshot)
    expect(result.config.extra).toMatchObject({
      customField: { keep: true },
      fuxaSetting: {
        viewGrids: {
          'view-1': { columns: 2, labelPosition: 'below' },
        },
        floorGroupFrames: { padding: 16 },
        floorGroupArtifacts: {
          'view-1': {},
          'view-2': {
            'floor:1F': { titleId: 'title-2', frameId: 'frame-2', frameShapeId: 'shape-2' },
          },
        },
        customSetting: 'preserve',
      },
    })
    expect(result.config.extra).toMatchObject({
      fuxaSetting: {
        viewGrids: { 'view-2': { columns: 7 } },
      },
    })
    expect(result.text).toContain('\r\n')
    expect(result.text.endsWith('\r\n')).toBe(true)
    expect(JSON.parse(result.text).hmi.views[0].applied).toBe(true)
  })

  it('does not return success output if SVG application or validation fails', () => {
    const applyFailure = new Error('invalid view')
    expect(() => prepareFuxaConfigExport(input({
      dirty: true,
      models: [model()],
      modifiedViewIds: new Set(['view-1']),
    }), {
      applyView: () => {
        throw applyFailure
      },
      validate: vi.fn(),
    })).toThrow(applyFailure)

    expect(() => prepareFuxaConfigExport(input({ dirty: true }), {
      validate: () => {
        throw new Error('validation failed')
      },
    })).toThrow('validation failed')
  })

  it('rejects modified View export when no SVG apply function is provided', () => {
    expect(() => prepareFuxaConfigExport(input({
      dirty: true,
      models: [model()],
      modifiedViewIds: new Set(['view-1']),
    }))).toThrow('尚未設定 SVG View 套用函式，無法匯出修改後的配置。')
  })

  it('requires output validation for modified exports', () => {
    expect(() => prepareFuxaConfigExport(input({ dirty: true })))
      .toThrow('尚未設定輸出驗證函式，無法匯出修改後的配置。')
  })
})
