import type { FuxaConfig } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'

export type TagAlarmLevel = 'highhigh' | 'high' | 'low' | 'info'
export type TagAlarmMessageLevel = 'info' | 'success' | 'warning' | 'error'

function isTagAlarmMessageLevel(value: unknown): value is TagAlarmMessageLevel {
  return value === 'info' || value === 'success' || value === 'warning' || value === 'error'
}

export interface TagAlarmDraft {
  tagId: string
  tagName: string
  text: string
  level: TagAlarmLevel
  messageLevel: TagAlarmMessageLevel
  invertState: boolean
  viewId: string
}

export function updateTagAlarmInversion(
  source: FuxaConfig,
  tagId: string,
  inverted: boolean,
): { config: FuxaConfig; updated: boolean } {
  const config = structuredClone(source)
  if (config.alarms !== undefined && !Array.isArray(config.alarms)) {
    throw new Error('FUXA alarms 欄位格式無效，無法反轉告警狀態。')
  }
  if (!Array.isArray(config.alarms)) return { config, updated: false }

  const alarm = config.alarms.find((candidate) => (
    isRecord(candidate)
    && isRecord(candidate.property)
    && candidate.property.variableId === tagId
  ))
  if (!isRecord(alarm)) return { config, updated: false }

  let updated = false
  let hasEnabledLevel = false
  const value = inverted ? 0 : 1
  for (const level of ['highhigh', 'high', 'low', 'info'] as const) {
    const setting = alarm[level]
    if (!isRecord(setting) || setting.enabled !== true) continue
    hasEnabledLevel = true
    if (setting.min === value && setting.max === value) continue
    setting.min = value
    setting.max = value
    updated = true
  }
  if (hasEnabledLevel && isRecord(alarm.actions) && Array.isArray(alarm.actions.values)) {
    for (const action of alarm.actions.values) {
      if (!isRecord(action) || (action.min === value && action.max === value)) continue
      action.min = value
      action.max = value
      updated = true
    }
  }
  return { config, updated }
}

export function updateExistingTagAlarmTexts(
  source: FuxaConfig,
  tagNames: ReadonlyMap<string, string>,
  messageLevel: TagAlarmMessageLevel,
): { config: FuxaConfig; updated: number; toastMessagesAdded: number } {
  const config = structuredClone(source)
  if (config.alarms !== undefined && !Array.isArray(config.alarms)) {
    throw new Error('FUXA alarms 欄位格式無效，無法更新告警文字。')
  }
  if (!isTagAlarmMessageLevel(messageLevel)) {
    throw new Error('告警訊息層級無效，無法新增訊息動作。')
  }
  if (!Array.isArray(config.alarms)) return { config, updated: 0, toastMessagesAdded: 0 }

  let updated = 0
  let toastMessagesAdded = 0
  for (const alarm of config.alarms) {
    if (!isRecord(alarm) || !isRecord(alarm.property)
        || typeof alarm.property.variableId !== 'string') continue
    const tagName = tagNames.get(alarm.property.variableId)?.trim()
    if (!tagName) continue

    let changed = false
    const text = `${tagName}異常`
    let hasEnabledLevel = false
    let actionMin = 1
    let actionMax = 1
    for (const level of ['highhigh', 'high', 'low', 'info'] as const) {
      const setting = alarm[level]
      if (!isRecord(setting) || setting.enabled !== true) continue
      if (!hasEnabledLevel) {
        actionMin = typeof setting.min === 'number' ? setting.min : 1
        actionMax = typeof setting.max === 'number' ? setting.max : 1
      }
      hasEnabledLevel = true
      if (setting.text === text) continue
      setting.text = text
      changed = true
    }
    if (hasEnabledLevel) {
      const previousActions = isRecord(alarm.actions) ? alarm.actions : {}
      const previousValues = Array.isArray(previousActions.values) ? previousActions.values : []
      let hasToastMessage = false
      for (const action of previousValues) {
        if (!isRecord(action) || action.type !== 'toastMessage') continue
        hasToastMessage = true
        if (action.actparam === text) continue
        action.actparam = text
        changed = true
      }
      if (!hasToastMessage) {
        alarm.actions = {
          ...previousActions,
          enabled: true,
          values: [
            ...previousValues,
            {
              min: actionMin,
              max: actionMax,
              type: 'toastMessage',
              actparam: text,
              actoptions: { type: messageLevel },
              checkdelay: 1,
              timedelay: 0,
            },
          ],
        }
        toastMessagesAdded += 1
        changed = true
      }
    }
    if (changed) updated += 1
  }
  return { config, updated, toastMessagesAdded }
}

const ALARM_LEVEL_DEFAULTS: Record<TagAlarmLevel, Record<string, unknown>> = {
  highhigh: {
    min: 1,
    max: 1,
    ackmode: 'ackactive',
    bkcolor: '#FF4848',
    color: '#FFF',
    checkdelay: 1,
    timedelay: 1,
  },
  high: {
    min: 1,
    max: 1,
    ackmode: 'ackactive',
    bkcolor: '#F9CF59',
    color: '#000',
    checkdelay: 1,
  },
  low: {
    min: 1,
    max: 1,
    ackmode: 'ackactive',
    bkcolor: '#E5E5E5',
    color: '#000',
    checkdelay: 1,
  },
  info: {
    min: 1,
    max: 1,
    ackmode: 'float',
    bkcolor: '#22A7F2',
    color: '#FFF',
    checkdelay: 1,
  },
}

function createAlarmLevel(
  level: TagAlarmLevel,
  text: string,
  enabled: boolean,
  inverted: boolean,
) {
  return {
    ...ALARM_LEVEL_DEFAULTS[level],
    ...(enabled && inverted ? { min: 0, max: 0 } : {}),
    enabled,
    text,
  }
}

export function applyTagAlarms(
  source: FuxaConfig,
  drafts: readonly TagAlarmDraft[],
): { config: FuxaConfig; created: number; updated: number } {
  const config = structuredClone(source)
  if (config.alarms !== undefined && !Array.isArray(config.alarms)) {
    throw new Error('FUXA alarms 欄位格式無效，無法設定告警。')
  }
  if (!drafts.length) throw new Error('請至少選擇一個 Tag。')

  const alarms: unknown[] = Array.isArray(config.alarms) ? config.alarms : []
  const seenTagIds = new Set<string>()
  let created = 0
  let updated = 0

  for (const draft of drafts) {
    const tagId = draft.tagId.trim()
    const tagName = draft.tagName.trim()
    const text = draft.text.trim()
    const viewId = draft.viewId.trim()
    if (!tagId || !tagName) throw new Error('告警 Tag 資料無效。')
    if (!text) throw new Error('告警文字不可空白。')
    if (!viewId) throw new Error(`Tag「${tagName}」尚未指定告警動作目標頁面。`)
    if (!Object.hasOwn(ALARM_LEVEL_DEFAULTS, draft.level)) {
      throw new Error(`Tag「${tagName}」的告警等級無效。`)
    }
    if (!isTagAlarmMessageLevel(draft.messageLevel)) {
      throw new Error(`Tag「${tagName}」的訊息層級無效。`)
    }
    if (seenTagIds.has(tagId)) throw new Error(`Tag「${tagName}」重複選取。`)
    seenTagIds.add(tagId)

    const index = alarms.findIndex((alarm) => (
      isRecord(alarm)
      && isRecord(alarm.property)
      && alarm.property.variableId === tagId
    ))
    const existing = index >= 0 && isRecord(alarms[index]) ? alarms[index] : {}
    const previousActions = isRecord(existing.actions) ? existing.actions : {}
    const previousValues = Array.isArray(previousActions.values)
      ? previousActions.values
      : []
    const alarm = {
      ...existing,
      highhigh: createAlarmLevel('highhigh', text, draft.level === 'highhigh', draft.invertState),
      high: createAlarmLevel('high', text, draft.level === 'high', draft.invertState),
      low: createAlarmLevel('low', text, draft.level === 'low', draft.invertState),
      info: createAlarmLevel('info', text, draft.level === 'info', draft.invertState),
      actions: {
        ...previousActions,
        enabled: true,
        values: [
          ...previousValues.filter((value) => (
            !isRecord(value) || (value.type !== 'setView' && value.type !== 'toastMessage')
          )),
          {
            min: draft.invertState ? 0 : 1,
            max: draft.invertState ? 0 : 1,
            type: 'setView',
            actparam: viewId,
            actoptions: { type: 'warning' },
            checkdelay: 1,
            timedelay: 1,
          },
          {
            min: draft.invertState ? 0 : 1,
            max: draft.invertState ? 0 : 1,
            type: 'toastMessage',
            actparam: text,
            actoptions: { type: draft.messageLevel },
            checkdelay: 1,
            timedelay: 0,
          },
        ],
      },
      property: {
        ...(isRecord(existing.property) ? existing.property : {}),
        variableId: tagId,
      },
      name: `${tagName}告警`,
    }

    if (index >= 0) {
      alarms[index] = alarm
      updated += 1
    } else {
      alarms.push(alarm)
      created += 1
    }
  }

  config.alarms = alarms
  return { config, created, updated }
}
