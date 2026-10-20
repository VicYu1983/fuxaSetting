import { isRecord } from '../config/validateFuxaConfig'
import type { FuxaConfig, FloorGroupFrameSettings } from '../config/types'

export const DEFAULT_FLOOR_GROUP_FRAME: Readonly<FloorGroupFrameSettings> = Object.freeze({
  fill: '#eff6ff',
  fillOpacity: 0.55,
  stroke: '#93c5fd',
  strokeWidth: 1,
  cornerRadius: 12,
  padding: 16,
})

const TOOL_SETTINGS_KEY = 'fuxaSetting'
const FLOOR_FRAME_SETTINGS_KEY = 'floorGroupFrames'
const FLOOR_FRAME_LAYOUT_VERSION_KEY = 'floorFrameLayoutVersion'
export const FLOOR_FRAME_LAYOUT_VERSION = 1

export function hasCurrentFloorFrameLayout(config: FuxaConfig): boolean {
  if (!isRecord(config.extra) || !isRecord(config.extra[TOOL_SETTINGS_KEY])) return false
  return config.extra[TOOL_SETTINGS_KEY][FLOOR_FRAME_LAYOUT_VERSION_KEY]
    === FLOOR_FRAME_LAYOUT_VERSION
}

export function saveFloorFrameLayoutVersion(config: FuxaConfig): void {
  if (config.extra !== undefined && !isRecord(config.extra)) {
    throw new Error('配置的 extra 欄位不是物件，無法安全保存樓層底框版面版本。')
  }
  const extra = isRecord(config.extra) ? config.extra : {}
  const currentToolSettings = extra[TOOL_SETTINGS_KEY]
  if (currentToolSettings !== undefined && !isRecord(currentToolSettings)) {
    throw new Error(
      `配置的 extra.${TOOL_SETTINGS_KEY} 欄位不是物件，無法安全保存樓層底框版面版本。`,
    )
  }
  extra[TOOL_SETTINGS_KEY] = {
    ...(isRecord(currentToolSettings) ? currentToolSettings : {}),
    [FLOOR_FRAME_LAYOUT_VERSION_KEY]: FLOOR_FRAME_LAYOUT_VERSION,
  }
  config.extra = extra
}

export function normalizeFloorGroupFrameSettings(settings: unknown): FloorGroupFrameSettings {
  const frame: FloorGroupFrameSettings = { ...DEFAULT_FLOOR_GROUP_FRAME }
  if (!isRecord(settings)) return frame

  for (const key of ['fill', 'stroke'] as const) {
    const value = settings[key]
    if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) {
      frame[key] = value.toLowerCase()
    }
  }

  for (const key of ['fillOpacity', 'strokeWidth', 'cornerRadius', 'padding'] as const) {
    const value = settings[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (key === 'fillOpacity' && value >= 0 && value <= 1) frame[key] = value
    else if (key === 'strokeWidth' && value >= 0 && value <= 10) frame[key] = value
    else if (key === 'cornerRadius' && value >= 0 && value <= 100) frame[key] = value
    else if (key === 'padding' && value >= 0 && value <= 200) frame[key] = value
  }

  return frame
}

function getToolSettings(config: FuxaConfig): Record<string, unknown> | undefined {
  if (!isRecord(config.extra) || !isRecord(config.extra[TOOL_SETTINGS_KEY])) return undefined
  return config.extra[TOOL_SETTINGS_KEY]
}

export function getFloorGroupFrameSettings(config: FuxaConfig): FloorGroupFrameSettings {
  return normalizeFloorGroupFrameSettings(getToolSettings(config)?.[FLOOR_FRAME_SETTINGS_KEY])
}

export function saveFloorGroupFrameSettings(
  config: FuxaConfig,
  settings: unknown,
): FloorGroupFrameSettings {
  if (config.extra !== undefined && !isRecord(config.extra)) {
    throw new Error('配置的 extra 欄位不是物件，無法安全保存樓層底框設定。')
  }
  const extra = isRecord(config.extra) ? config.extra : {}
  config.extra = extra

  const currentToolSettings = extra[TOOL_SETTINGS_KEY]
  if (currentToolSettings !== undefined && !isRecord(currentToolSettings)) {
    throw new Error(`配置的 extra.${TOOL_SETTINGS_KEY} 欄位不是物件，無法安全保存樓層底框設定。`)
  }
  const toolSettings = isRecord(currentToolSettings) ? currentToolSettings : {}
  const currentFrameSettings = toolSettings[FLOOR_FRAME_SETTINGS_KEY]
  if (currentFrameSettings !== undefined && !isRecord(currentFrameSettings)) {
    throw new Error(
      `配置的 extra.${TOOL_SETTINGS_KEY}.${FLOOR_FRAME_SETTINGS_KEY} 欄位不是物件，無法安全保存樓層底框設定。`,
    )
  }

  const normalized = normalizeFloorGroupFrameSettings(settings)
  extra[TOOL_SETTINGS_KEY] = { ...toolSettings, [FLOOR_FRAME_SETTINGS_KEY]: normalized }
  return normalized
}
