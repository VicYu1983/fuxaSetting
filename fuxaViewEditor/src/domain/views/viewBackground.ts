import type { FuxaConfig } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'

export const DEFAULT_VIEW_BACKGROUND_COLOR = '#ffffff'

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const OPAQUE_ALPHA = 'ff'

export interface UpdateViewBackgroundResult {
  config: FuxaConfig
  changed: boolean
}

// 將 FUXA 的 bkcolor（#rgb / #rgba / #rrggbb / #rrggbbaa）轉為 color input 可用的 #rrggbb
export function toViewBackgroundInputColor(value: unknown): string {
  if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) {
    return DEFAULT_VIEW_BACKGROUND_COLOR
  }
  const digits = value.slice(1).toLowerCase()
  if (digits.length === 3 || digits.length === 4) {
    return `#${digits.slice(0, 3).split('').map((digit) => digit + digit).join('')}`
  }
  return `#${digits.slice(0, 6)}`
}

// FUXA 預設以 8 位 hex（含 alpha）保存 bkcolor，此處採不透明值
export function toStoredViewBackgroundColor(inputColor: string): string {
  if (!/^#[\da-f]{6}$/i.test(inputColor)) {
    throw new Error(`背景色「${inputColor}」不是有效的 #rrggbb 色碼。`)
  }
  return `${inputColor.toLowerCase()}${OPAQUE_ALPHA}`
}

export function getViewBackgroundInputColor(config: FuxaConfig, viewIndex: number): string {
  const view = config.hmi.views[viewIndex]
  const profile = isRecord(view) && isRecord(view.profile) ? view.profile : undefined
  return toViewBackgroundInputColor(profile?.bkcolor)
}

// 將背景色套用至所有 View，回傳新配置；沒有任何 View 變動時 changed 為 false
export function updateAllViewBackgrounds(
  source: FuxaConfig,
  inputColor: string,
): UpdateViewBackgroundResult {
  const stored = toStoredViewBackgroundColor(inputColor)
  const needsUpdate = source.hmi.views.some((view) => {
    if (!isRecord(view)) return false
    const profile = isRecord(view.profile) ? view.profile : undefined
    return profile?.bkcolor !== stored
  })
  if (!needsUpdate) return { config: source, changed: false }

  const config = structuredClone(source)
  for (const view of config.hmi.views) {
    if (!isRecord(view)) continue
    const profile = isRecord(view.profile) ? view.profile : {}
    view.profile = { ...profile, bkcolor: stored }
  }
  return { config, changed: true }
}
