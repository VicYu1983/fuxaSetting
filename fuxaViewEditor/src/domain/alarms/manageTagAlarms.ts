import type { FuxaConfig } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'

export type TagAlarmLevel = 'highhigh' | 'high' | 'low' | 'info'
export type TagAlarmMessageLevel = 'info' | 'success' | 'warning' | 'error'

export interface TagAlarmDraft {
  tagId: string
  tagName: string
  text: string
  level: TagAlarmLevel
  messageLevel: TagAlarmMessageLevel
  viewId: string
}

export function updateExistingTagAlarmTexts(
  source: FuxaConfig,
  tagNames: ReadonlyMap<string, string>,
): { config: FuxaConfig; updated: number } {
  const config = structuredClone(source)
  if (config.alarms !== undefined && !Array.isArray(config.alarms)) {
    throw new Error('FUXA alarms 欄位格式無效，無法更新告警文字。')
  }
  if (!Array.isArray(config.alarms)) return { config, updated: 0 }

  let updated = 0
  for (const alarm of config.alarms) {
    if (!isRecord(alarm) || !isRecord(alarm.property)
        || typeof alarm.property.variableId !== 'string') continue
    const tagName = tagNames.get(alarm.property.variableId)?.trim()
    if (!tagName) continue

    let changed = false
    const text = `${tagName}異常`
    let hasEnabledLevel = false
    for (const level of ['highhigh', 'high', 'low', 'info'] as const) {
      const setting = alarm[level]
      if (!isRecord(setting) || setting.enabled !== true) continue
      hasEnabledLevel = true
      if (setting.text === text) continue
      setting.text = text
      changed = true
    }
    if (hasEnabledLevel && isRecord(alarm.actions) && Array.isArray(alarm.actions.values)) {
      for (const action of alarm.actions.values) {
        if (!isRecord(action) || action.type !== 'toastMessage' || action.actparam === text) continue
        action.actparam = text
        changed = true
      }
    }
    if (changed) updated += 1
  }
  return { config, updated }
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

function createAlarmLevel(level: TagAlarmLevel, text: string, enabled: boolean) {
  return {
    ...ALARM_LEVEL_DEFAULTS[level],
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
    if (!['info', 'success', 'warning', 'error'].includes(draft.messageLevel)) {
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
      highhigh: createAlarmLevel('highhigh', text, draft.level === 'highhigh'),
      high: createAlarmLevel('high', text, draft.level === 'high'),
      low: createAlarmLevel('low', text, draft.level === 'low'),
      info: createAlarmLevel('info', text, draft.level === 'info'),
      actions: {
        ...previousActions,
        enabled: true,
        values: [
          ...previousValues.filter((value) => (
            !isRecord(value) || (value.type !== 'setView' && value.type !== 'toastMessage')
          )),
          {
            min: 1,
            max: 1,
            type: 'setView',
            actparam: viewId,
            actoptions: { type: 'warning' },
            checkdelay: 1,
            timedelay: 1,
          },
          {
            min: 1,
            max: 1,
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
