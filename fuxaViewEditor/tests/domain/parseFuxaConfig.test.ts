import { describe, expect, it } from 'vitest'
import { parseFuxaConfig } from '../../src/domain/config/parseFuxaConfig'

describe('parseFuxaConfig', () => {
  it('summarizes FUXA views while retaining the original configuration', () => {
    const raw = {
      devices: {
        deviceA: { tags: { tagA: {}, tagB: {} } },
        deviceB: { tags: { tagC: {} } },
      },
      hmi: {
        views: [{
          id: 'view-a',
          name: 'Overview',
          profile: { width: 1024, height: 768 },
          items: { itemA: {}, itemB: {} },
        }],
      },
      untouched: { value: true },
    }

    const result = parseFuxaConfig(JSON.stringify(raw))

    expect(result.views).toEqual([{
      key: 'view-a-0',
      id: 'view-a',
      name: 'Overview',
      width: 1024,
      height: 768,
      itemCount: 2,
    }])
    expect(result.devices).toEqual(raw.devices)
    expect(result.rawConfig.untouched).toEqual({ value: true })
  })

  it('creates unique keys for views even when identifiers are missing or repeated', () => {
    const result = parseFuxaConfig(JSON.stringify({
      devices: {},
      hmi: {
        views: [
          { id: 'duplicate', name: 'First' },
          { id: 'duplicate', name: 'Second' },
          {},
        ],
      },
    }))

    expect(result.views.map((view) => view.key)).toEqual([
      'duplicate-0',
      'duplicate-1',
      'view-2',
    ])
    expect(result.views[2].name).toBe('未命名 View 3')
  })

  it('reports malformed JSON and non-FUXA shapes explicitly', () => {
    expect(() => parseFuxaConfig('{')).toThrow('JSON 格式錯誤')
    expect(() => parseFuxaConfig(JSON.stringify({}))).toThrow(
      '需包含 devices 與 hmi.views',
    )
  })
})
