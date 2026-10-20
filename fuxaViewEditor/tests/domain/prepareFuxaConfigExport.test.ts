import { describe, expect, it, vi } from 'vitest'
import type { FuxaConfig, SourceTextFormat } from '../../src/domain/config/types'
import { prepareFuxaConfigExport } from '../../src/domain/config/prepareFuxaConfigExport'
import { createFuxaConfigExportDependencies } from '../../src/domain/config/fuxaConfigExportDependencies'
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
      iconScale: 100,
    },
    floorGroupFrame: {
      fill: '#eff6ff',
      fillOpacity: 0.55,
      stroke: '#93c5fd',
      strokeWidth: 1,
      cornerRadius: 12,
      padding: 16,
    },
    floorTitles: {},
    floorTitleIds: {},
    floorFrames: {},
    floorFrameIds: {},
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

  it('writes the edited project name to the top-level JSON name', () => {
    const original = config()
    original.name = 'Before'
    const result = prepareFuxaConfigExport(input({
      config: original,
      projectName: 'After',
    }), {
      validate: vi.fn(),
    })

    expect(result.dirty).toBe(true)
    expect(result.config.name).toBe('After')
    expect(JSON.parse(result.text).name).toBe('After')
    expect(original.name).toBe('Before')
  })

  it('keeps the original JSON text when the project name is unchanged', () => {
    const original = config()
    original.name = 'Same name'
    const originalText = '{ "name": "Same name", "devices": {}, "hmi": { "views": [] } }\n'
    const result = prepareFuxaConfigExport(input({
      config: original,
      originalText,
      projectName: 'Same name',
    }))

    expect(result.text).toBe(originalText)
    expect(result.config).toBe(original)
    expect(result.dirty).toBe(false)
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

  it('rejects missing or ambiguous modified Views instead of silently skipping them', () => {
    const missingView = input({
      dirty: true,
      models: [model('missing')],
      modifiedViewIds: new Set(['missing']),
    })
    expect(() => prepareFuxaConfigExport(missingView, {
      applyView: vi.fn(),
      validate: vi.fn(),
    })).toThrow('配置中找不到已修改的 View「missing」。')

    const duplicateConfig = config()
    duplicateConfig.hmi.views.push({
      id: 'view-1',
      name: 'Duplicate',
      items: {},
      svgcontent: '<svg/>',
    })
    expect(() => prepareFuxaConfigExport(input({
      config: duplicateConfig,
      dirty: true,
      models: [model()],
      modifiedViewIds: new Set(['view-1']),
    }), {
      applyView: vi.fn(),
      validate: vi.fn(),
    })).toThrow('配置中 View ID「view-1」重複，無法安全匯出。')

    expect(() => prepareFuxaConfigExport(input({
      dirty: true,
      modifiedViewIds: new Set(['view-1']),
    }), {
      applyView: vi.fn(),
      validate: vi.fn(),
    })).toThrow('找不到 View「view-1」的編輯模型，無法匯出修改。')

    expect(() => prepareFuxaConfigExport(input({
      dirty: true,
      models: [model(), model()],
    }), {
      validate: vi.fn(),
    })).toThrow('編輯模型包含重複的 View ID「view-1」，無法安全匯出。')
  })

  it('does not let SVG application mutate the caller-owned model', () => {
    const currentModel = model()
    const snapshot = structuredClone(currentModel)
    const result = prepareFuxaConfigExport(input({
      dirty: true,
      models: [currentModel],
      modifiedViewIds: new Set(['view-1']),
    }), {
      applyView: (_view, stagedModel) => {
        stagedModel.floorTitles['floor:1F'] = 'generated-title'
      },
      validate: vi.fn(),
    })

    expect(currentModel).toEqual(snapshot)
    expect(result.models[0]?.floorTitles['floor:1F']).toBe('generated-title')
  })

  it('provides the SVG validation/export adapters for metadata-only dirty changes', () => {
    class Parser {
      parseFromString(): XMLDocument {
        throw new Error('Parser should not be used when no View is modified.')
      }
    }
    const original = config()
    const dependencies = createFuxaConfigExportDependencies(original, {
      Parser,
      serialize: () => {
        throw new Error('Serializer should not be used when no View is modified.')
      },
      crypto: {
        getRandomValues(bytes) {
          return bytes
        },
      },
    })

    const result = prepareFuxaConfigExport(input({
      config: original,
      dirty: true,
    }), dependencies)

    expect(result.dirty).toBe(true)
    expect(result.modifiedViewIds.size).toBe(0)
    expect(JSON.parse(result.text).hmi.views).toHaveLength(2)
    expect(result.config.extra).toMatchObject({
      fuxaSetting: { floorFrameLayoutVersion: 1 },
    })
  })

  it('surfaces malformed existing SVG when it prevents safe ID allocation', () => {
    class Parser {
      parseFromString(): XMLDocument {
        return {
          documentElement: { localName: 'html' },
          getElementsByTagName: () => [],
        } as unknown as XMLDocument
      }
    }
    const source = config()
    const dependencies = createFuxaConfigExportDependencies(source, {
      Parser,
      serialize: () => '<svg/>',
      crypto: {
        getRandomValues(bytes) {
          return bytes
        },
      },
    })
    const targetView = source.hmi.views[1] as Record<string, unknown>
    const targetModel = model('view-2')

    expect(() => dependencies.applyView?.(targetView, targetModel, [targetModel]))
      .toThrow('無法檢查 View「Main」的 SVG ID，無法安全匯出修改：View 的 svgcontent 無法解析。')
  })
})
