import { isRecord } from '../config/validateFuxaConfig'
import type { FuxaConfig, GridSettings, LabelPosition } from '../config/types'

export const DEFAULT_GRID: Readonly<GridSettings> = Object.freeze({
  columns: 4,
  originX: 60,
  originY: 80,
  gapX: 40,
  gapY: 40,
  labelPosition: 'above',
  labelOffset: 10,
  labelFontSize: 14,
})

const GRID_SETTINGS_KEY = 'fuxaSetting'
const LABEL_POSITIONS = new Set<LabelPosition>(['above', 'below', 'left', 'right'])

function isLabelPosition(value: string): value is LabelPosition {
  return LABEL_POSITIONS.has(value as LabelPosition)
}

export function normalizeGridSettings(settings: unknown): GridSettings {
  const grid: GridSettings = { ...DEFAULT_GRID }
  if (!isRecord(settings)) return grid

  for (const key of ['columns', 'originX', 'originY', 'gapX', 'gapY', 'labelOffset', 'labelFontSize'] as const) {
    const value = settings[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue

    if (key === 'columns') {
      if (Number.isInteger(value) && value >= 1 && value <= 24) grid[key] = value
    } else if (key === 'labelFontSize') {
      if (value >= 8 && value <= 72) grid[key] = value
    } else if (value >= 0) {
      grid[key] = value
    }
  }

  if (typeof settings.labelPosition === 'string' && isLabelPosition(settings.labelPosition)) {
    grid.labelPosition = settings.labelPosition
  }

  return grid
}

function getToolSettings(config: FuxaConfig): Record<string, unknown> | undefined {
  if (!isRecord(config.extra) || !isRecord(config.extra[GRID_SETTINGS_KEY])) return undefined
  return config.extra[GRID_SETTINGS_KEY]
}

export function getViewGridSettings(config: FuxaConfig, viewId: string): GridSettings {
  const toolSettings = getToolSettings(config)
  const viewGrids = toolSettings && isRecord(toolSettings.viewGrids)
    ? toolSettings.viewGrids
    : undefined
  return normalizeGridSettings(viewGrids?.[viewId])
}

export function saveViewGridSettings(
  config: FuxaConfig,
  viewIds: readonly string[],
  grids: ReadonlyMap<string, unknown>,
): Record<string, unknown> {
  if (config.extra !== undefined && !isRecord(config.extra)) {
    throw new Error('配置的 extra 欄位不是物件，無法安全保存 Grid 設定。')
  }
  const extra = isRecord(config.extra) ? config.extra : {}
  config.extra = extra

  const currentToolSettings = extra[GRID_SETTINGS_KEY]
  if (currentToolSettings !== undefined && !isRecord(currentToolSettings)) {
    throw new Error(`配置的 extra.${GRID_SETTINGS_KEY} 欄位不是物件，無法安全保存 Grid 設定。`)
  }
  const toolSettings = isRecord(currentToolSettings) ? currentToolSettings : {}

  const currentViewGrids = toolSettings.viewGrids
  if (currentViewGrids !== undefined && !isRecord(currentViewGrids)) {
    throw new Error(`配置的 extra.${GRID_SETTINGS_KEY}.viewGrids 欄位不是物件，無法安全保存 Grid 設定。`)
  }
  const viewGrids = isRecord(currentViewGrids) ? { ...currentViewGrids } : {}
  const activeViewIds = new Set(viewIds)

  for (const viewId of Object.keys(viewGrids)) {
    if (!activeViewIds.has(viewId)) delete viewGrids[viewId]
  }
  for (const [viewId, settings] of grids) {
    if (activeViewIds.has(viewId)) viewGrids[viewId] = normalizeGridSettings(settings)
  }

  const updatedToolSettings = { ...toolSettings, version: 1, viewGrids }
  extra[GRID_SETTINGS_KEY] = updatedToolSettings
  return updatedToolSettings
}
