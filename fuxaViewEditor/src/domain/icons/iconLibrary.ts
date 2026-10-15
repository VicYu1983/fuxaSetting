import type { FuxaConfig } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'

export type IconMimeType = 'image/png' | 'image/jpeg' | 'image/gif'

export interface IconAsset {
  id: string
  mimeType: IconMimeType
  dataUrl: string
  [key: string]: unknown
}

export interface SingleIcon extends IconAsset {
  name: string
  type?: 'single'
}

export interface IconPair {
  id: string
  name: string
  type: 'pair'
  normal: IconAsset
  alarm: IconAsset
  [key: string]: unknown
}

export interface MultiStateIconDefinition {
  key: string
  name: string
  asset: IconAsset
}

export interface MultiStateIconSet {
  id: string
  name: string
  type: 'multi-state'
  normal: IconAsset
  states: MultiStateIconDefinition[]
  [key: string]: unknown
}

export type IconLibraryEntry = SingleIcon | IconPair | MultiStateIconSet
export const MAX_MULTI_STATE_COUNT = 8

const TOOL_SETTINGS_KEY = 'fuxaSetting'
const ICON_LIBRARY_KEY = 'icons'
const ALLOWED_MIME_TYPES: readonly IconMimeType[] = ['image/png', 'image/jpeg', 'image/gif']

function isIconAsset(value: unknown): value is IconAsset {
  if (!isRecord(value)
      || typeof value.id !== 'string' || !value.id
      || typeof value.mimeType !== 'string'
      || !ALLOWED_MIME_TYPES.includes(value.mimeType as IconMimeType)
      || typeof value.dataUrl !== 'string') {
    return false
  }
  const mimeType = value.mimeType as IconMimeType
  if (!value.dataUrl.startsWith(`data:${mimeType};base64,`)) return false
  const base64 = value.dataUrl.slice(value.dataUrl.indexOf(',') + 1)
  return /^[A-Za-z0-9+/]+={0,2}$/.test(base64)
}

export function validateIconLibrary(icons: unknown): IconLibraryEntry[] {
  if (!Array.isArray(icons)) {
    throw new Error(`配置的 extra.${TOOL_SETTINGS_KEY}.${ICON_LIBRARY_KEY} 欄位不是陣列。`)
  }

  const ids = new Set<string>()
  for (const icon of icons) {
    if (!isRecord(icon) || typeof icon.id !== 'string' || !icon.id
        || typeof icon.name !== 'string' || !icon.name.trim()) {
      throw new Error('圖示庫包含無效項目；請確認圖片格式與 Base64 資料。')
    }
    if (ids.has(icon.id)) throw new Error(`圖示庫包含重複 ID：${icon.id}`)
    ids.add(icon.id)

    if (icon.type === 'pair') {
      if (!isIconAsset(icon.normal) || !isIconAsset(icon.alarm)) {
        throw new Error('正常／告警圖示組包含無效圖片；請確認圖片格式與 Base64 資料。')
      }
      for (const asset of [icon.normal, icon.alarm]) {
        if (ids.has(asset.id)) throw new Error(`圖示庫包含重複 ID：${asset.id}`)
        ids.add(asset.id)
      }
    } else if (icon.type === 'multi-state') {
      if (!isIconAsset(icon.normal)
          || !Array.isArray(icon.states)
          || icon.states.length < 1
          || icon.states.length > MAX_MULTI_STATE_COUNT) {
        throw new Error(`多狀態圖示組「${icon.name}」需要正常圖示及 1–${MAX_MULTI_STATE_COUNT} 個狀態。`)
      }
      const keys = new Set<string>()
      const names = new Set<string>()
      for (const state of icon.states) {
        if (!isRecord(state)
            || typeof state.key !== 'string' || !state.key
            || typeof state.name !== 'string' || !state.name.trim()
            || !isIconAsset(state.asset)) {
          throw new Error(`多狀態圖示組「${icon.name}」包含無效狀態。`)
        }
        if (keys.has(state.key)) throw new Error(`多狀態圖示組「${icon.name}」包含重複狀態 ID：${state.key}`)
        keys.add(state.key)
        const normalizedName = state.name.trim().toLocaleLowerCase()
        if (names.has(normalizedName)) throw new Error(`多狀態圖示組「${icon.name}」包含重複狀態名稱：${state.name}`)
        names.add(normalizedName)
      }
      for (const asset of [icon.normal, ...icon.states.map((state) => state.asset)]) {
        if (ids.has(asset.id)) throw new Error(`圖示庫包含重複 ID：${asset.id}`)
        ids.add(asset.id)
      }
    } else if (icon.type !== undefined && icon.type !== 'single') {
      throw new Error('圖示庫項目類型無效；僅支援一般圖示、正常／告警圖示或多狀態圖示。')
    } else if (!isIconAsset(icon)) {
      throw new Error('圖示庫包含無效項目；請確認圖片格式與 Base64 資料。')
    }
  }

  return icons.map((icon) => {
    if (icon.type === 'pair') {
      return { ...icon, normal: { ...icon.normal }, alarm: { ...icon.alarm } }
    }
    if (icon.type === 'multi-state') {
      return {
        ...icon,
        normal: { ...icon.normal },
        states: icon.states.map((state: MultiStateIconDefinition) => ({
          ...state,
          asset: { ...state.asset },
        })),
      }
    }
    return { ...icon }
  })
}

export function getIconAssets(icon: IconLibraryEntry): IconAsset[] {
  if (icon.type === 'pair') return [icon.normal, icon.alarm]
  if (icon.type === 'multi-state') return [icon.normal, ...icon.states.map((state) => state.asset)]
  return [icon]
}

export interface VisibilityAction {
  variableId: string
  range: { min: number; max: number }
  type: 'show' | 'hide'
  options: Record<string, never>
}

export function buildVisibilityActions(tagId: string, visibleValue: number): VisibilityAction[] {
  if (typeof tagId !== 'string' || !tagId || ![0, 1].includes(visibleValue)) {
    throw new Error('圖示可見條件需要有效的 Boolean Tag 與 0／1 狀態值。')
  }
  return [0, 1].map((value) => ({
    variableId: tagId,
    range: { min: value, max: value },
    type: value === visibleValue ? 'show' : 'hide',
    options: {},
  }))
}

export function getIconLibrary(config: unknown): IconLibraryEntry[] {
  const extra = isRecord(config) && isRecord(config.extra) ? config.extra : undefined
  const toolSettings = extra && isRecord(extra[TOOL_SETTINGS_KEY])
    ? extra[TOOL_SETTINGS_KEY]
    : undefined
  const icons = toolSettings?.[ICON_LIBRARY_KEY]
  return icons === undefined ? [] : validateIconLibrary(icons)
}

export function saveIconLibrary(
  config: FuxaConfig,
  icons: unknown,
): IconLibraryEntry[] {
  if (!isRecord(config)) throw new Error('無效的配置資料。')
  if (config.extra !== undefined && !isRecord(config.extra)) {
    throw new Error('配置的 extra 欄位不是物件，無法安全保存圖示庫。')
  }
  const extra = isRecord(config.extra) ? config.extra : {}
  config.extra = extra

  const currentSettings = extra[TOOL_SETTINGS_KEY]
  if (currentSettings !== undefined && !isRecord(currentSettings)) {
    throw new Error(`配置的 extra.${TOOL_SETTINGS_KEY} 欄位不是物件，無法安全保存圖示庫。`)
  }

  const validatedIcons = validateIconLibrary(icons)
  extra[TOOL_SETTINGS_KEY] = {
    ...(isRecord(currentSettings) ? currentSettings : {}),
    [ICON_LIBRARY_KEY]: validatedIcons,
  }
  return validatedIcons
}
