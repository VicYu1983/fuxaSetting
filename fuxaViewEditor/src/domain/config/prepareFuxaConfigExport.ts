import type {
  FloorGroupFrameSettings,
  FuxaConfig,
  SourceTextFormat,
} from './types'
import { serializeFuxaConfig } from './serialization'
import { saveViewGridSettings } from '../layout/gridSettings'
import { saveFloorGroupFrameSettings } from '../layout/floorGroupFrame'
import { saveFloorGroupArtifacts } from '../layout/floorGroupArtifacts'
import { groupComponentsByFloor } from '../layout/floorLayout'
import type { FloorLayoutComponent, FloorTag } from '../layout/floorLayout'
import { saveIconLibrary } from '../icons/iconLibrary'
import { isRecord } from './validateFuxaConfig'

export interface ExportViewModel {
  viewId: string
  components: readonly FloorLayoutComponent[]
  grid: unknown
  floorTitles: Record<string, string>
  floorFrames: Record<string, string>
  floorFrameShapeIds: Record<string, string>
}

export interface PrepareFuxaConfigExportInput {
  config: FuxaConfig
  originalText: string
  sourceFormat: SourceTextFormat
  dirty: boolean
  models?: readonly ExportViewModel[]
  modifiedViewIds?: ReadonlySet<string>
  tags?: Map<string, FloorTag> | Record<string, FloorTag>
  floorGroupFrame?: FloorGroupFrameSettings
  iconLibrary?: unknown
  originalIconLibrary?: string
}

export interface PrepareFuxaConfigExportDependencies {
  applyView?: (view: Record<string, unknown>, model: ExportViewModel) => void
  validate?: (
    config: FuxaConfig,
    modifiedViewIds: ReadonlySet<string>,
    models: readonly ExportViewModel[],
  ) => void
}

export interface PreparedFuxaConfigExport {
  config: FuxaConfig
  text: string
  dirty: boolean
  modifiedViewIds: ReadonlySet<string>
}

function viewById(config: FuxaConfig, viewId: string): Record<string, unknown> | undefined {
  if (!Array.isArray(config.hmi.views)) return undefined
  return config.hmi.views.find(
    (view): view is Record<string, unknown> => isRecord(view) && view.id === viewId,
  )
}

function floorArtifactsForModel(
  model: ExportViewModel,
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
): Record<string, { titleId: string; frameId: string; frameShapeId: string }> {
  const artifacts: Record<string, { titleId: string; frameId: string; frameShapeId: string }> = {}
  for (const group of groupComponentsByFloor(model.components, tags)) {
    const key = `floor:${group.floor}`
    const titleId = model.floorTitles[key]
    const frameId = model.floorFrames[key]
    const frameShapeId = model.floorFrameShapeIds[key]
    if (titleId && frameId && frameShapeId) {
      artifacts[key] = { titleId, frameId, frameShapeId }
    }
  }
  return artifacts
}

export function prepareFuxaConfigExport(
  input: PrepareFuxaConfigExportInput,
  dependencies: PrepareFuxaConfigExportDependencies = {},
): PreparedFuxaConfigExport {
  if (!input.dirty) {
    return {
      config: input.config,
      text: input.originalText,
      dirty: false,
      modifiedViewIds: new Set(),
    }
  }

  const output = structuredClone(input.config)
  const models = input.models ?? []
  const modifiedViewIds = new Set<string>()
  const tags = input.tags ?? {}
  const allViewIds = output.hmi.views.flatMap((view) =>
    isRecord(view) && typeof view.id === 'string' ? [view.id] : [],
  )

  for (const model of models) {
    const view = viewById(output, model.viewId)
    if (!view || !input.modifiedViewIds?.has(model.viewId)) continue
    if (!dependencies.applyView) {
      throw new Error('尚未設定 SVG View 套用函式，無法匯出修改後的配置。')
    }
    dependencies.applyView(view, model)
    modifiedViewIds.add(model.viewId)
  }

  if (input.iconLibrary !== undefined
      && JSON.stringify(input.iconLibrary) !== input.originalIconLibrary) {
    saveIconLibrary(output, input.iconLibrary)
  }

  saveViewGridSettings(
    output,
    allViewIds,
    new Map(models.map((model) => [model.viewId, model.grid])),
  )
  if (input.floorGroupFrame) {
    saveFloorGroupFrameSettings(output, input.floorGroupFrame)
  }
  saveFloorGroupArtifacts(
    output,
    allViewIds,
    new Map(models.map((model) => [model.viewId, floorArtifactsForModel(model, tags)])),
  )

  if (!dependencies.validate) {
    throw new Error('尚未設定輸出驗證函式，無法匯出修改後的配置。')
  }
  const text = serializeFuxaConfig(output, input.sourceFormat)
  const parsedOutput = JSON.parse(text) as FuxaConfig
  dependencies.validate(parsedOutput, modifiedViewIds, models)

  return { config: output, text, dirty: true, modifiedViewIds }
}
