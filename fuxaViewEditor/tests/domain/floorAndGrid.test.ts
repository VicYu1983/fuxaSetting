import { describe, expect, it } from 'vitest'
import {
  compareFloors,
  getTagFloor,
  groupByFloor,
  normalizeFloor,
  setTagFloor,
} from '../../src/domain/tags/floor'
import {
  DEFAULT_GRID,
  getViewGridSettings,
  normalizeGridSettings,
  saveViewGridSettings,
} from '../../src/domain/layout/gridSettings'

describe('floor metadata', () => {
  it('normalizes floor labels and preserves other Tag extra fields', () => {
    const tag = { id: 'tag-1', extra: { note: 'keep', owner: 'ops' } }

    expect(getTagFloor(tag)).toBe('')
    expect(setTagFloor(tag, ' b02f ')).toBe('B2F')
    expect(tag.extra).toEqual({ note: 'keep', owner: 'ops', floor: 'B2F' })
    expect(setTagFloor(tag, '4f')).toBe('4F')
    expect(setTagFloor(tag, '')).toBe('')
    expect(tag.extra).toEqual({ note: 'keep', owner: 'ops' })
    expect(normalizeFloor(' 屋頂 ')).toBe('屋頂')
    expect(normalizeFloor('b 03')).toBe('B3F')
    expect(normalizeFloor('02f')).toBe('2F')
  })

  it('sorts basements, floors, roof, custom floors, then unassigned floors', () => {
    const groups = groupByFloor(
      ['roof', 'first', 'basement', 'custom', 'unset'],
      (item) => ({
        roof: '屋頂',
        first: '1f',
        basement: 'b2f',
        custom: '機房層',
      })[item],
    )

    expect(groups.map(({ title }) => title)).toEqual([
      'B2F',
      '1F',
      '屋頂',
      '機房層',
      '未設定樓層',
    ])
    expect(compareFloors('B2F', 'B1F')).toBeLessThan(0)
    expect(compareFloors('2F', '')).toBeLessThan(0)
  })
})

describe('View Grid settings', () => {
  it('normalizes valid settings and ignores invalid values', () => {
    expect(normalizeGridSettings({
      columns: 6,
      originX: 20,
      labelPosition: 'right',
      labelFontSize: 18,
      gapX: -1,
      labelOffset: Number.NaN,
    })).toEqual({
      ...DEFAULT_GRID,
      columns: 6,
      originX: 20,
      labelPosition: 'right',
      labelFontSize: 18,
    })

    expect(normalizeGridSettings({ columns: 25, labelPosition: 'invalid' }))
      .toEqual(DEFAULT_GRID)
  })

  it('loads and saves settings by View ID while preserving sibling settings', () => {
    const config = {
      devices: {},
      hmi: { views: [{ id: 'view-a' }, { id: 'view-b' }] },
      extra: {
        keep: { value: true },
        fuxaSetting: {
          note: 'keep',
          viewGrids: {
            'view-a': {
              columns: 6,
              originX: 20,
              labelPosition: 'right',
              labelFontSize: 18,
            },
            'removed-view': { columns: 2 },
          },
        },
      },
    }

    const gridA = getViewGridSettings(config, 'view-a')
    expect(gridA).toEqual({
      ...DEFAULT_GRID,
      columns: 6,
      originX: 20,
      labelPosition: 'right',
      labelFontSize: 18,
    })
    expect(getViewGridSettings(config, 'view-b')).toEqual(DEFAULT_GRID)

    saveViewGridSettings(config, ['view-a', 'view-b'], new Map([
      ['view-a', gridA],
      ['view-b', { ...DEFAULT_GRID, columns: 3 }],
    ]))

    expect(config.extra).toEqual({
      keep: { value: true },
      fuxaSetting: {
        note: 'keep',
        version: 1,
        viewGrids: {
          'view-a': gridA,
          'view-b': { ...DEFAULT_GRID, columns: 3 },
        },
      },
    })
  })

  it('rejects malformed tool settings rather than overwriting them', () => {
    const config = { devices: {}, hmi: { views: [] }, extra: 'preserve this' }

    expect(() => saveViewGridSettings(config, [], new Map()))
      .toThrow('extra 欄位不是物件')
    expect(config.extra).toBe('preserve this')
  })
})
