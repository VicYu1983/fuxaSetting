import type { FuxaConfig } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'

export interface FloorGroupArtifact {
  titleId: string
  frameId: string
  frameShapeId: string
}

export type FloorGroupArtifacts = Record<string, FloorGroupArtifact>
export type FloorGroupArtifactsByView = ReadonlyMap<string, unknown>

const TOOL_SETTINGS_KEY = 'fuxaSetting'
const FLOOR_GROUP_ARTIFACTS_KEY = 'floorGroupArtifacts'
const ARTIFACT_ID_KEYS = ['titleId', 'frameId', 'frameShapeId'] as const

export function getFloorGroupArtifacts(
  config: FuxaConfig,
  viewId: string,
): Record<string, unknown> {
  const extra = isRecord(config.extra) ? config.extra : undefined
  const toolSettings = extra && isRecord(extra[TOOL_SETTINGS_KEY])
    ? extra[TOOL_SETTINGS_KEY]
    : undefined
  const allArtifacts = toolSettings && isRecord(toolSettings[FLOOR_GROUP_ARTIFACTS_KEY])
    ? toolSettings[FLOOR_GROUP_ARTIFACTS_KEY]
    : undefined
  const viewArtifacts = allArtifacts?.[viewId]
  return isRecord(viewArtifacts) ? viewArtifacts : {}
}

export function saveFloorGroupArtifacts(
  config: FuxaConfig,
  viewIds: readonly string[],
  artifactsByView: FloorGroupArtifactsByView,
): Record<string, unknown> {
  if (!isRecord(config)) throw new Error('無效的配置資料。')
  if (config.extra !== undefined && !isRecord(config.extra)) {
    throw new Error('配置的 extra 欄位不是物件，無法安全保存樓層群組元件索引。')
  }
  const extra = isRecord(config.extra) ? config.extra : {}
  config.extra = extra

  const currentSettings = extra[TOOL_SETTINGS_KEY]
  if (currentSettings !== undefined && !isRecord(currentSettings)) {
    throw new Error(
      `配置的 extra.${TOOL_SETTINGS_KEY} 欄位不是物件，無法安全保存樓層群組元件索引。`,
    )
  }
  const toolSettings = isRecord(currentSettings) ? currentSettings : {}
  const currentArtifacts = toolSettings[FLOOR_GROUP_ARTIFACTS_KEY]
  if (currentArtifacts !== undefined && !isRecord(currentArtifacts)) {
    throw new Error(
      `配置的 extra.${TOOL_SETTINGS_KEY}.${FLOOR_GROUP_ARTIFACTS_KEY} 欄位不是物件，無法安全保存樓層群組元件索引。`,
    )
  }

  const artifacts: Record<string, unknown> = isRecord(currentArtifacts)
    ? { ...currentArtifacts }
    : {}
  const activeViewIds = new Set(viewIds)
  for (const viewId of Object.keys(artifacts)) {
    if (!activeViewIds.has(viewId)) delete artifacts[viewId]
  }

  for (const [viewId, viewArtifacts] of artifactsByView) {
    if (!activeViewIds.has(viewId)) continue
    if (!isRecord(viewArtifacts)) {
      throw new Error(`View「${viewId}」的樓層群組元件索引格式無效。`)
    }

    const normalized: FloorGroupArtifacts = {}
    for (const [floorKey, entry] of Object.entries(viewArtifacts)) {
      if (!isRecord(entry)) {
        throw new Error(`View「${viewId}」的樓層群組「${floorKey}」元件索引不完整。`)
      }
      const titleId = entry.titleId
      const frameId = entry.frameId
      const frameShapeId = entry.frameShapeId
      if (
        !ARTIFACT_ID_KEYS.every((key) => typeof entry[key] === 'string' && entry[key])
        || typeof titleId !== 'string'
        || typeof frameId !== 'string'
        || typeof frameShapeId !== 'string'
      ) {
        throw new Error(`View「${viewId}」的樓層群組「${floorKey}」元件索引不完整。`)
      }
      normalized[floorKey] = {
        titleId,
        frameId,
        frameShapeId,
      }
    }
    artifacts[viewId] = normalized
  }

  const updatedSettings = { ...toolSettings, [FLOOR_GROUP_ARTIFACTS_KEY]: artifacts }
  extra[TOOL_SETTINGS_KEY] = updatedSettings
  return artifacts
}
