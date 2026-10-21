import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import {
  applyTagAlarms,
  updateExistingTagAlarmTexts,
} from '../../src/domain/alarms/manageTagAlarms'

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

describe('updateExistingTagAlarmTexts', () => {
  it('updates enabled alarm levels by Tag name and preserves other settings', () => {
    const source = createConfig()
    source.alarms = [
      {
        property: { variableId: 'tag-1' },
        highhigh: { enabled: true, text: '舊文字', custom: true },
        high: { enabled: false, text: '停用文字' },
        actions: { enabled: true },
      },
      {
        property: { variableId: 'unknown-tag' },
        high: { enabled: true, text: '維持原狀' },
      },
    ]

    const result = updateExistingTagAlarmTexts(
      source,
      new Map([['tag-1', '水箱水位']]),
    )
    const alarms = result.config.alarms as Record<string, unknown>[]

    expect(result.updated).toBe(1)
    expect(alarms[0]).toMatchObject({
      highhigh: { enabled: true, text: '水箱水位異常', custom: true },
      high: { enabled: false, text: '停用文字' },
      actions: { enabled: true },
    })
    expect(alarms[1]).toMatchObject({
      high: { enabled: true, text: '維持原狀' },
    })
    expect((source.alarms as Record<string, unknown>[])[0]).toMatchObject({
      highhigh: { text: '舊文字' },
    })
  })

  it('does not count alarms with no enabled level or unchanged text', () => {
    const source = createConfig()
    source.alarms = [{
      property: { variableId: 'tag-1' },
      highhigh: { enabled: true, text: '水箱水位異常' },
      high: { enabled: false, text: '舊文字' },
    }]

    const result = updateExistingTagAlarmTexts(source, new Map([['tag-1', '水箱水位']]))

    expect(result.updated).toBe(0)
    expect(result.config.alarms).toEqual(source.alarms)
  })

  it('rejects an invalid alarms field', () => {
    const source = createConfig()
    source.alarms = {}

    expect(() => updateExistingTagAlarmTexts(source, new Map()))
      .toThrow('FUXA alarms 欄位格式無效')
  })
})
