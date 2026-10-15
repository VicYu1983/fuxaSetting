import type { FuxaConfig, FloorGroupFrameSettings } from '../../domain/config/types'
import {
  getFloorGroupFrameSettings,
  normalizeFloorGroupFrameSettings,
  saveFloorGroupFrameSettings,
} from '../../domain/layout/floorGroupFrame'

export interface UpdateFloorGroupFrameResult {
  config: FuxaConfig
  changed: boolean
}

export function updateFloorGroupFrame(
  source: FuxaConfig,
  settings: unknown,
): UpdateFloorGroupFrameResult {
  const normalized = normalizeFloorGroupFrameSettings(settings)
  const current = getFloorGroupFrameSettings(source)
  if (JSON.stringify(current) === JSON.stringify(normalized)) {
    return { config: source, changed: false }
  }
  const config = structuredClone(source)
  saveFloorGroupFrameSettings(config, normalized)
  return { config, changed: true }
}

export type { FloorGroupFrameSettings }
