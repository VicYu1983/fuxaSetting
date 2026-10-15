import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../../src/domain/config/types'
import { DEFAULT_FLOOR_GROUP_FRAME } from '../../../src/domain/layout/floorGroupFrame'
import { DEFAULT_GRID } from '../../../src/domain/layout/gridSettings'
import type { ExportViewModel } from '../../../src/domain/config/prepareFuxaConfigExport'
import type { GeneratedComponent } from '../../../src/domain/svg/validateGeneratedView'
import { prepareFuxaConfigExport } from '../../../src/domain/config/prepareFuxaConfigExport'
import { getIconLibrary } from '../../../src/domain/icons/iconLibrary'
import type { SvgParserConstructor } from '../../../src/domain/svg/parseSvg'
import {
  addIconLibraryEntry,
  findIconLibraryUsages,
  findIconLibrarySvgUsages,
  identifyIconMimeType,
  removeIconLibraryEntry,
} from '../../../src/features/icons/iconLibraryManagement'
import {
  getComponentGraphicChoices,
  selectedComponentGraphic,
  updateComponentGraphic,
} from '../../../src/features/icons/componentGraphics'

const fixedRandom = {
  getRandomValues(bytes: Uint8Array<ArrayBuffer>) {
    bytes.fill(7)
    return bytes
  },
}

const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x02])

function emptyConfig(): FuxaConfig {
  return { devices: {}, hmi: { views: [] }, extra: { preserve: true } }
}

function model(component: ExportViewModel['components'][number]): ExportViewModel {
  return {
    viewId: 'view-1',
    components: [component],
    grid: DEFAULT_GRID,
    floorGroupFrame: DEFAULT_FLOOR_GROUP_FRAME,
    floorTitles: {},
    floorTitleIds: {},
    floorFrames: {},
    floorFrameIds: {},
    floorFrameShapeIds: {},
  }
}

describe('iconLibraryManagement', () => {
  it('identifies supported signatures and preserves GIF bytes in its data URL', () => {
    expect(identifyIconMimeType(gifBytes)).toBe('image/gif')
    expect(identifyIconMimeType(new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]))).toBe('image/png')
    expect(identifyIconMimeType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg')
    expect(identifyIconMimeType(new Uint8Array([0, 1, 2]))).toBeNull()
    const result = addIconLibraryEntry(emptyConfig(), 'Animated', 'single', [gifBytes], fixedRandom)
    const icon = getIconLibrary(result)[0]!
    expect(icon.mimeType).toBe('image/gif')
    expect(icon.dataUrl).toBe(`data:image/gif;base64,${btoa(String.fromCharCode(...gifBytes))}`)
    const exported = prepareFuxaConfigExport({
      config: result,
      originalText: '',
      sourceFormat: { lineEnding: '\n', hasTrailingNewline: false },
      dirty: true,
    }, { validate: () => undefined })
    expect(JSON.parse(exported.text).extra.fuxaSetting.icons[0].dataUrl).toBe(icon.dataUrl)
  })

  describe('managed component graphics', () => {
    const iconLibrary = [
      {
        id: 'icon-single',
        name: 'Fan',
        type: 'single' as const,
        mimeType: 'image/gif' as const,
        dataUrl: 'data:image/gif;base64,R0lGODlh',
      },
      {
        id: 'icon-pair',
        name: 'Pump',
        type: 'pair' as const,
        normal: { id: 'pump-normal', mimeType: 'image/gif' as const, dataUrl: 'data:image/gif;base64,R0lGODlh' },
        alarm: { id: 'pump-alarm', mimeType: 'image/gif' as const, dataUrl: 'data:image/gif;base64,R0lGODlh' },
      },
    ]
    const component: GeneratedComponent = {
      key: 'loaded-1',
      tagId: 'bool-tag',
      template: 'rect',
      shapeId: 'shape-1',
      labelId: 'label-1',
      seq: 1,
      managed: true,
    }

    it('offers graphic choices and selects the configured icon and icon pair', () => {
      expect(getComponentGraphicChoices(iconLibrary, component, true).map(({ value }) => value))
        .toEqual(['rect', 'cylinder', 'icon:icon-single', 'pair:icon-pair'])

      const pair = updateComponentGraphic(component, 'pair:icon-pair', iconLibrary, () => 'alarm-1')
      expect(pair).toMatchObject({
        template: 'icon-pair',
        normalIconId: 'pump-normal',
        alarmIconId: 'pump-alarm',
        alarmShapeId: 'alarm-1',
      })
      expect(selectedComponentGraphic(pair, iconLibrary)).toBe('pair:icon-pair')

      const single = updateComponentGraphic(pair, 'icon:icon-single', iconLibrary, () => 'unused')
      expect(single).toMatchObject({ template: 'icon', iconId: 'icon-single' })
      expect(single).not.toHaveProperty('alarmShapeId')
      expect(single).not.toHaveProperty('normalIconId')
    })

    it('retains a legacy pair choice and disables adding pair icons to non-Boolean tags', () => {
      const legacy: GeneratedComponent = {
        ...component,
        template: 'icon-pair',
        normalIconId: 'legacy-normal',
        alarmIconId: 'legacy-alarm',
        alarmShapeId: 'legacy-shape',
      }
      expect(selectedComponentGraphic(legacy, iconLibrary))
        .toBe('pair:legacy:legacy-normal:legacy-alarm')
      expect(getComponentGraphicChoices(iconLibrary, component, false)
        .find(({ value }) => value === 'pair:icon-pair')?.disabled).toBe(true)
      const retained = updateComponentGraphic(
        legacy,
        selectedComponentGraphic(legacy, iconLibrary),
        iconLibrary,
        () => 'unused',
      )
      expect(retained.normalIconId).toBe('legacy-normal')
    })
  })

  it('creates a validated normal/alarm pair and rejects case-insensitive duplicate names', () => {
    const source = addIconLibraryEntry(emptyConfig(), 'Pump', 'pair', [gifBytes, gifBytes], fixedRandom)
    const pair = getIconLibrary(source)[0]!
    if (pair.type !== 'pair') throw new Error('Expected icon pair.')
    expect(pair).toMatchObject({ name: 'Pump', type: 'pair' })
    expect(pair.normal).toMatchObject({ mimeType: 'image/gif' })
    expect(pair.alarm).toMatchObject({ mimeType: 'image/gif' })
    expect(() => addIconLibraryEntry(source, 'pUMP', 'single', [gifBytes], fixedRandom))
      .toThrow('已存在')
  })

  it('blocks removal while a managed component references either pair asset', () => {
    const source = addIconLibraryEntry(emptyConfig(), 'Pump', 'pair', [gifBytes, gifBytes], fixedRandom)
    const pair = getIconLibrary(source)[0]!
    if (pair.type !== 'pair') throw new Error('Expected icon pair.')
    const models = new Map([['view-1', model({
      key: 'tc_1',
      tagId: 'tag-1',
      label: 'Pump motor',
      seq: 1,
      managed: true,
      shapeId: 'shape-1',
      template: 'icon-pair',
      alarmIconId: pair.alarm.id,
    })]])
    const usages = findIconLibraryUsages(
      [pair],
      models,
      new Map([['view-1', 'Overview']]),
      new Map([['tag-1', 'Motor']]),
      pair.id,
    )
    expect(usages).toEqual(['「Overview」的 Pump motor'])
    expect(() => removeIconLibraryEntry(source, pair.id, usages)).toThrow('無法刪除')
    expect(() => removeIconLibraryEntry(source, pair.id, [])).not.toThrow()
  })

  it('finds icon references in every View SVG, including views without editor models', () => {
    const source = addIconLibraryEntry(emptyConfig(), 'Pump', 'pair', [gifBytes, gifBytes], fixedRandom)
    const pair = getIconLibrary(source)[0]!
    if (pair.type !== 'pair') throw new Error('Expected icon pair.')
    const Parser = class {
      parseFromString() {
        const elements = [{
          getAttribute: (name: string) => name === 'data-fuxa-icon-id' ? pair.normal.id : null,
        }]
        return {
          documentElement: { localName: 'svg' },
          getElementsByTagName: (name: string) => name === 'parsererror' ? [] : elements,
        } as unknown as XMLDocument
      }
    } as unknown as SvgParserConstructor
    source.hmi.views = [{ id: 'broken-model', name: 'Unavailable model', svgcontent: '<svg/>' }]
    expect(findIconLibrarySvgUsages([pair], source, pair.id, Parser))
      .toEqual(['「Unavailable model」的 SVG 元件'])
  })
})
