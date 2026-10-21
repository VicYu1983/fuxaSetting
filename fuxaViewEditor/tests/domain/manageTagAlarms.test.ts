import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import { applyTagAlarms } from '../../src/domain/alarms/manageTagAlarms'

function createConfig(): FuxaConfig {
  return {
    devices: {},
    hmi: { views: [] },
  }
}

describe('applyTagAlarms', () => {
  it('creates one alarm per Tag with the selected level, shared text, and target View', () => {
    const source = createConfig()
    const result = applyTagAlarms(source, [
      {
        tagId: 'tag-1',
        tagName: '水箱水位',
        text: '水位異常',
        level: 'highhigh',
        viewId: 'view-water',
      },
      {
        tagId: 'tag-2',
        tagName: '水箱溫度',
        text: '水位異常',
        level: 'highhigh',
        viewId: 'view-water',
      },
    ])
    const alarms = result.config.alarms as Record<string, unknown>[]

    expect(result).toMatchObject({ created: 2, updated: 0 })
    expect(alarms).toHaveLength(2)
    expect(alarms[0]).toMatchObject({
      highhigh: { enabled: true, text: '水位異常' },
      high: { enabled: false },
      low: { enabled: false },
      info: { enabled: false },
      actions: {
        enabled: true,
        values: [{ type: 'setView', actparam: 'view-water' }],
      },
      property: { variableId: 'tag-1' },
      name: '水箱水位告警',
    })
    expect(source).not.toHaveProperty('alarms')
  })

  it('updates an existing alarm for a Tag instead of adding a duplicate', () => {
    const source = createConfig()
    source.alarms = [{
      property: { variableId: 'tag-1', retained: true },
      actions: {
        enabled: false,
        values: [{ type: 'notify', actparam: 'keep' }, { type: 'setView', actparam: 'old' }],
      },
      custom: 'preserved',
    }]

    const result = applyTagAlarms(source, [{
      tagId: 'tag-1',
      tagName: '水箱水位',
      text: '低水位',
      level: 'low',
      viewId: 'view-water',
    }])
    const alarms = result.config.alarms as Record<string, unknown>[]

    expect(result).toMatchObject({ created: 0, updated: 1 })
    expect(alarms).toHaveLength(1)
    expect(alarms[0]).toMatchObject({
      low: { enabled: true, text: '低水位' },
      property: { variableId: 'tag-1', retained: true },
      actions: {
        enabled: true,
        values: [
          { type: 'notify', actparam: 'keep' },
          { type: 'setView', actparam: 'view-water' },
        ],
      },
      custom: 'preserved',
    })
    expect(source.alarms).toHaveLength(1)
  })

  it('rejects missing text, destination, duplicate Tag selection, and invalid alarm data', () => {
    const source = createConfig()
    const base = {
      tagId: 'tag-1',
      tagName: '水箱水位',
      text: '水位異常',
      level: 'highhigh' as const,
      viewId: 'view-water',
    }

    expect(() => applyTagAlarms(source, [{ ...base, text: ' ' }]))
      .toThrow('告警文字不可空白')
    expect(() => applyTagAlarms(source, [{ ...base, viewId: '' }]))
      .toThrow('尚未指定告警動作目標頁面')
    expect(() => applyTagAlarms(source, [base, base]))
      .toThrow('重複選取')
    source.alarms = {}
    expect(() => applyTagAlarms(source, [base]))
      .toThrow('FUXA alarms 欄位格式無效')
  })
})
