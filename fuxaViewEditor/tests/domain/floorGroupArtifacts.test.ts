import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import { isRecord } from '../../src/domain/config/validateFuxaConfig'
import {
  getFloorGroupArtifacts,
  saveFloorGroupArtifacts,
} from '../../src/domain/layout/floorGroupArtifacts'

describe('Floor group artifacts', () => {
  it('reads and saves active View artifacts while preserving sibling settings', () => {
    const config: FuxaConfig = {
      devices: {},
      hmi: { views: [] },
      extra: {
        keep: true,
        fuxaSetting: {
          note: 'keep',
          viewGrids: { 'view-a': { columns: 4 } },
          floorGroupArtifacts: {
            'removed-view': { 'floor:1F': {} },
          },
        },
      },
    }
    const artifacts = new Map([
      ['view-a', {
        'floor:': {
          titleId: 'title-empty',
          frameId: 'frame-empty',
          frameShapeId: 'frame-shape-empty',
        },
        'floor:B1F': {
          titleId: 'title-b1',
          frameId: 'frame-b1',
          frameShapeId: 'frame-shape-b1',
        },
      }],
      ['removed-view', { 'floor:1F': {} }],
    ])

    saveFloorGroupArtifacts(config, ['view-a'], artifacts)

    expect(getFloorGroupArtifacts(config, 'view-a')).toEqual({
      'floor:': {
        titleId: 'title-empty',
        frameId: 'frame-empty',
        frameShapeId: 'frame-shape-empty',
      },
      'floor:B1F': {
        titleId: 'title-b1',
        frameId: 'frame-b1',
        frameShapeId: 'frame-shape-b1',
      },
    })
    expect(getFloorGroupArtifacts(config, 'removed-view')).toEqual({})
    const extra = config.extra
    if (!isRecord(extra) || !isRecord(extra.fuxaSetting)) {
      throw new Error('Expected saved tool settings')
    }
    expect(extra.keep).toBe(true)
    expect(extra.fuxaSetting.note).toBe('keep')
    expect(extra.fuxaSetting.viewGrids).toEqual({ 'view-a': { columns: 4 } })
    expect(extra.fuxaSetting.floorGroupArtifacts).not.toHaveProperty('removed-view')
  })

  it('returns an empty object for absent or malformed settings', () => {
    expect(getFloorGroupArtifacts({ devices: {}, hmi: { views: [] } }, 'view-a')).toEqual({})
    expect(getFloorGroupArtifacts({
      devices: {},
      hmi: { views: [] },
      extra: { fuxaSetting: { floorGroupArtifacts: { 'view-a': [] } } },
    }, 'view-a')).toEqual({})
  })

  it('rejects unsafe storage shapes and incomplete artifact records', () => {
    expect(() => saveFloorGroupArtifacts({
      devices: {},
      hmi: { views: [] },
      extra: 'keep',
    }, [], new Map())).toThrow('extra 欄位不是物件')

    expect(() => saveFloorGroupArtifacts({
      devices: {},
      hmi: { views: [] },
      extra: { fuxaSetting: { floorGroupArtifacts: [] } },
    }, [], new Map())).toThrow('floorGroupArtifacts 欄位不是物件')

    expect(() => saveFloorGroupArtifacts({
      devices: {},
      hmi: { views: [] },
    }, ['view-a'], new Map([['view-a', { 'floor:1F': { titleId: 'title' } }]])))
      .toThrow('元件索引不完整')
  })
})
