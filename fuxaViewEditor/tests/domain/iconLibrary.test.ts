import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import { isRecord } from '../../src/domain/config/validateFuxaConfig'
import {
  buildVisibilityActions,
  getIconAssets,
  getIconLibrary,
  saveIconLibrary,
  validateIconLibrary,
} from '../../src/domain/icons/iconLibrary'

const singleIcon = {
  id: 'icon-one',
  name: 'pump',
  mimeType: 'image/png',
  dataUrl: 'data:image/png;base64,iVBORw==',
}

const iconPair = {
  id: 'icon-set-one',
  name: '消防泵',
  type: 'pair',
  normal: {
    id: 'icon-one-normal',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,iVBORw==',
  },
  alarm: {
    id: 'icon-one-alarm',
    mimeType: 'image/gif',
    dataUrl: 'data:image/gif;base64,R0lGODlh',
  },
}

const multiStateIconSet = {
  id: 'icon-set-multi',
  name: 'Water tank',
  type: 'multi-state',
  normal: {
    id: 'water-normal',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,iVBORw==',
  },
  states: [{
    key: 'high-level',
    name: 'High level',
    asset: {
      id: 'water-high',
      mimeType: 'image/gif',
      dataUrl: 'data:image/gif;base64,R0lGODlh',
    },
  }],
}

describe('icon library', () => {
  it('reads and saves icons without discarding sibling configuration', () => {
    const config: FuxaConfig = {
      devices: {},
      hmi: { views: [] },
      extra: {
        keep: true,
        fuxaSetting: {
          note: 'keep',
          viewGrids: { 'view-a': { columns: 3 } },
        },
      },
    }

    expect(getIconLibrary(config)).toEqual([])
    expect(saveIconLibrary(config, [singleIcon])).toEqual([singleIcon])
    expect(getIconLibrary(config)).toEqual([singleIcon])
    const extra = config.extra
    if (!isRecord(extra) || !isRecord(extra.fuxaSetting)) {
      throw new Error('Expected saved tool settings')
    }
    expect(extra.keep).toBe(true)
    expect(extra.fuxaSetting).toMatchObject({
      note: 'keep',
      viewGrids: { 'view-a': { columns: 3 } },
      icons: [singleIcon],
    })
  })

  it('validates paired normal/alarm assets and returns independent entries', () => {
    const [validated] = validateIconLibrary([iconPair])
    expect(validated).toEqual(iconPair)
    if (!validated || validated.type !== 'pair') throw new Error('Expected a paired icon')
    expect(validated).not.toBe(iconPair)
    expect(validated.normal).not.toBe(iconPair.normal)
    expect(validated.alarm).not.toBe(iconPair.alarm)
  })

  it('validates and clones multi-state icon sets with unique state keys and assets', () => {
    const firstState = multiStateIconSet.states[0]!
    const [validated] = validateIconLibrary([multiStateIconSet])
    expect(validated).toEqual(multiStateIconSet)
    if (!validated || validated.type !== 'multi-state') {
      throw new Error('Expected a multi-state icon set')
    }
    expect(validated.normal).not.toBe(multiStateIconSet.normal)
    expect(validated.states[0]?.asset).not.toBe(firstState.asset)
    expect(getIconAssets(validated).map((asset) => asset.id))
      .toEqual(['water-normal', 'water-high'])
    expect(() => validateIconLibrary([{
      ...multiStateIconSet,
      states: [firstState, {
        ...firstState,
        key: 'low-level',
        name: 'High Level',
        asset: { ...firstState.asset, id: 'water-high-2' },
      }],
    }])).toThrow('重複狀態名稱')
    expect(() => validateIconLibrary([{
      ...multiStateIconSet,
      states: [{ ...firstState, key: '' }],
    }])).toThrow('無效狀態')
  })

  it('rejects invalid MIME/base64 data, duplicate IDs, and malformed tool settings', () => {
    expect(() => validateIconLibrary({})).toThrow('不是陣列')
    expect(() => validateIconLibrary([{ ...singleIcon, mimeType: 'image/svg+xml' }]))
      .toThrow('無效項目')
    expect(() => validateIconLibrary([{ ...singleIcon, dataUrl: 'https://example.com/image.png' }]))
      .toThrow('無效項目')
    expect(() => validateIconLibrary([singleIcon, singleIcon])).toThrow('重複 ID')
    expect(() => validateIconLibrary([{
      ...iconPair,
      alarm: { ...iconPair.alarm, dataUrl: 'https://example.com/alarm.png' },
    }])).toThrow('無效圖片')
    expect(() => validateIconLibrary([{
      ...iconPair,
      alarm: { ...iconPair.alarm, id: iconPair.normal.id },
    }])).toThrow('重複 ID')
    expect(() => saveIconLibrary({
      devices: {},
      hmi: { views: [] },
      extra: { fuxaSetting: false },
    }, [])).toThrow('欄位不是物件')
  })
})

describe('buildVisibilityActions', () => {
  it('builds complementary show/hide rules for both Boolean states', () => {
    expect(buildVisibilityActions('tag-bool', 0)).toEqual([
      { variableId: 'tag-bool', range: { min: 0, max: 0 }, type: 'show', options: {} },
      { variableId: 'tag-bool', range: { min: 1, max: 1 }, type: 'hide', options: {} },
    ])
    expect(buildVisibilityActions('tag-bool', 1)).toEqual([
      { variableId: 'tag-bool', range: { min: 0, max: 0 }, type: 'hide', options: {} },
      { variableId: 'tag-bool', range: { min: 1, max: 1 }, type: 'show', options: {} },
    ])
    expect(() => buildVisibilityActions('', 0)).toThrow('Boolean Tag')
    expect(() => buildVisibilityActions('tag-bool', 2)).toThrow('0／1')
  })
})
