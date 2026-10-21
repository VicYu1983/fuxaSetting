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
import type { FloorTag } from '../layout/floorLayout'
import { saveIconLibrary } from '../icons/iconLibrary'
import {
  deviceTagsNeedAddressSorting,
  sortDeviceTagsByAddress,
} from '../devices/deviceTagAddressSort'
import { generateId } from '../ids'
import { isRecord } from './validateFuxaConfig'
import type { GeneratedViewModel } from '../svg/validateGeneratedView'

export const VOICE_SCRIPT_CODE = [
  "const voice = speechSynthesis.getVoices().find(v => v.lang === 'zh-TW' && v.localService);",
  'const u = new SpeechSynthesisUtterance(message);',
  'if (voice) u.voice = voice;',
  "u.lang = 'zh-TW';",
  'speechSynthesis.speak(u);',
].join('\n')

export interface ExportViewModel extends GeneratedViewModel {
  floorFrameShapeIds: Record<string, string>
  originalFloorTitleIds?: Record<string, string[]>
  originalFloorFrameIds?: Record<string, string[]>
}

export interface PrepareFuxaConfigExportInput {
  config: FuxaConfig
  originalText: string
  sourceFormat: SourceTextFormat
  dirty: boolean
  projectName?: string
  models?: readonly ExportViewModel[]
  modifiedViewIds?: ReadonlySet<string>
  tags?: Map<string, FloorTag> | Record<string, FloorTag>
  floorGroupFrame?: FloorGroupFrameSettings
  iconLibrary?: unknown
  originalIconLibrary?: string
}

export interface PrepareFuxaConfigExportDependencies {
  applyView?: (
    view: Record<string, unknown>,
    model: ExportViewModel,
    models: readonly ExportViewModel[],
  ) => void
  validate?: (
    config: FuxaConfig,
    modifiedViewIds: ReadonlySet<string>,
    models: readonly ExportViewModel[],
  ) => void
  alignFloorFrames?: (config: FuxaConfig) => void
}

export interface PreparedFuxaConfigExport {
  config: FuxaConfig
  text: string
  dirty: boolean
  modifiedViewIds: ReadonlySet<string>
  models: readonly ExportViewModel[]
}

export function needsVoiceScriptUpdate(config: FuxaConfig): boolean {
  if (config.scripts !== undefined && !Array.isArray(config.scripts)) {
    throw new Error('FUXA scripts 欄位格式無效，無法加入語音方法。')
  }
  const voiceScripts = Array.isArray(config.scripts)
    ? config.scripts.filter((script) => isRecord(script) && script.name === 'voice')
    : []
  return voiceScripts.length === 0 || voiceScripts.some((script) => (
    isRecord(script) && script.code !== VOICE_SCRIPT_CODE
  ))
}

function updateVoiceScripts(config: FuxaConfig): void {
  const scripts = Array.isArray(config.scripts) ? config.scripts : []
  const voiceScripts = scripts.filter((script) => isRecord(script) && script.name === 'voice')
  if (voiceScripts.length) {
    for (const script of voiceScripts) {
      if (isRecord(script)) script.code = VOICE_SCRIPT_CODE
    }
    config.scripts = scripts
    return
  }

  const usedIds = new Set(scripts.flatMap((script) => (
    isRecord(script) && typeof script.id === 'string' ? [script.id] : []
  )))
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('目前環境無法產生語音方法 ID，請使用支援 Web Crypto 的瀏覽器。')
  }
  const id = generateId('s', usedIds, globalThis.crypto)
  config.scripts = [
    ...scripts,
    {
      id,
      name: 'voice',
      sync: false,
      parameters: [
        { name: 'message', type: 'value' },
        { name: 'count', type: 'value' },
      ],
      mode: 'CLIENT',
      code: VOICE_SCRIPT_CODE,
    },
  ]
}

// 舊版輸出的 Switch 內層 id 為 SHE_，FUXA 無法掛載開關元件，需重建
export function findLegacySwitchViewIds(
  models: readonly ExportViewModel[],
): Set<string> {
  const ids = new Set<string>()
  for (const model of models) {
    const legacy = model.components.some((component) =>
      component.managed !== false
      && component.template === 'switch'
      && !(component.shapeInnerIds?.[1] ?? '').startsWith('H-HXT_')
      || component.managed !== false
      && component.template === 'switch'
      && !(component.shapeInnerIds?.[2] ?? '').startsWith('T-HXT_'))
    if (legacy) ids.add(model.viewId)
  }
  return ids
}

function viewsById(config: FuxaConfig, viewId: string): Record<string, unknown>[] {
  if (!Array.isArray(config.hmi.views)) return []
  return config.hmi.views.filter(
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
  const projectNameChanged = input.projectName !== undefined
    && input.config.name !== input.projectName
  const deviceTagsNeedSorting = deviceTagsNeedAddressSorting(input.config)
  if (!input.dirty
      && !projectNameChanged
      && !deviceTagsNeedSorting
      && !needsVoiceScriptUpdate(input.config)
      && findLegacySwitchViewIds(input.models ?? []).size === 0) {
    return {
      config: input.config,
      text: input.originalText,
      dirty: false,
      modifiedViewIds: new Set(),
      models: input.models ?? [],
    }
  }

  const output = structuredClone(input.config)
  updateVoiceScripts(output)
  sortDeviceTagsByAddress(output)
  if (input.projectName !== undefined) output.name = input.projectName
  const models = (input.models ?? []).map((model) => structuredClone(model))
  const modifiedViewIds = new Set<string>()
  const tags = input.tags ?? {}
  const modelIds = new Set<string>()
  for (const model of models) {
    if (modelIds.has(model.viewId)) {
      throw new Error(`編輯模型包含重複的 View ID「${model.viewId}」，無法安全匯出。`)
    }
    modelIds.add(model.viewId)
  }
  const allViewIds = output.hmi.views.flatMap((view) =>
    isRecord(view) && typeof view.id === 'string' ? [view.id] : [],
  )

  const requestedViewIds = new Set([
    ...(input.modifiedViewIds ?? []),
    ...findLegacySwitchViewIds(models),
  ])
  for (const viewId of requestedViewIds) {
    const model = models.find((candidate) => candidate.viewId === viewId)
    if (!model) {
      throw new Error(`找不到 View「${viewId}」的編輯模型，無法匯出修改。`)
    }
    const matchingViews = viewsById(output, viewId)
    if (matchingViews.length !== 1) {
      throw new Error(
        matchingViews.length === 0
          ? `配置中找不到已修改的 View「${viewId}」。`
          : `配置中 View ID「${viewId}」重複，無法安全匯出。`,
      )
    }
    const view = matchingViews[0]!
    if (!dependencies.applyView) {
      throw new Error('尚未設定 SVG View 套用函式，無法匯出修改後的配置。')
    }
    dependencies.applyView(view, model, models)
    modifiedViewIds.add(viewId)
  }

  dependencies.alignFloorFrames?.(output)

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

  return { config: output, text, dirty: true, modifiedViewIds, models }
}
