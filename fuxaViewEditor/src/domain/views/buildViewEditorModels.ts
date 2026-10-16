import type { FuxaConfig } from '../config/types'
import { getFloorGroupFrameSettings } from '../layout/floorGroupFrame'
import type { FloorLayoutComponent, Bounds } from '../layout/floorLayout'
import { getViewGridSettings } from '../layout/gridSettings'
import { getFloorGroupArtifacts } from '../layout/floorGroupArtifacts'
import { getIconAssets, getIconLibrary } from '../icons/iconLibrary'
import { readManaged } from '../svg/readManaged'
import type { SvgParserConstructor } from '../svg/parseSvg'
import type { ExportViewModel } from '../config/prepareFuxaConfigExport'
import { isRecord } from '../config/validateFuxaConfig'

export interface ExistingTagComponent extends FloorLayoutComponent {
  shapeId: string
  type: string
}

export interface ViewEditorModelsResult {
  models: Map<string, ExportViewModel>
  errors: Map<string, string>
  unsupported: Map<string, string[]>
}

export type MeasureSvgBounds = (doc: XMLDocument, id: string) => Bounds

function hasSvgTransform(node: Element): boolean {
  let current: Element | null = node
  while (current && current.localName !== 'svg') {
    const transform = current.getAttribute('transform')
    const isToolPosition = current === node
      && current.getAttribute('data-fuxa-floor-layout') === 'floor-layout-v1'
      && /^translate\(-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?\)$/.test(transform ?? '')
    if (transform && !isToolPosition) return true
    current = current.parentElement
  }
  return false
}

function existingTagComponents(
  view: Record<string, unknown>,
  parsed: ReturnType<typeof readManaged>,
  measureBounds: MeasureSvgBounds,
  unsupported: string[],
): ExistingTagComponent[] {
  const components: ExistingTagComponent[] = []
  if (!parsed.doc) return components

  for (const candidate of parsed.movableTags) {
    try {
      const bounds = measureBounds(parsed.doc, candidate.id)
      components.push({
        key: `existing-${candidate.id}`,
        tagId: candidate.tagId,
        label: candidate.name,
        template: 'existing',
        shapeId: candidate.id,
        seq: Number.MAX_SAFE_INTEGER,
        type: candidate.type,
        managed: false,
        originalBounds: bounds,
        layoutWidth: bounds.width,
        layoutHeight: bounds.height,
        companions: [],
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      unsupported.push(`${candidate.name}：${reason}`)
    }
  }

  const usedLabels = new Set<string>()
  const labels: Array<{ id: string; bounds: Bounds }> = []
  const items = isRecord(view.items) ? view.items : {}
  for (const [id, item] of Object.entries(items)) {
    if (!isRecord(item)
        || item.type !== 'svg-ext-shapes-text'
        || (isRecord(item.property) && typeof item.property.variableId === 'string')
        || item.name === 'fuxa_floor_section_title'
        || /^tc_\d+_label$/.test(typeof item.name === 'string' ? item.name : '')) continue
    const node = Array.from(parsed.doc.getElementsByTagName('*'))
      .find((element) => element.getAttribute('id') === id)
    if (!node || node.localName !== 'text' || hasSvgTransform(node)) continue
    try {
      labels.push({ id, bounds: measureBounds(parsed.doc, id) })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const name = typeof item.name === 'string' ? item.name : id
      unsupported.push(`${name}：無法量測既有文字位置（${reason}）`)
    }
  }

  for (const component of components) {
    const shape = component.originalBounds
    if (!shape) continue
    const centerX = shape.x + shape.width / 2
    const candidate = labels
      .filter(({ id, bounds }) => {
        if (usedLabels.has(id)) return false
        const centerDiff = Math.abs(bounds.x + bounds.width / 2 - centerX)
        const verticalGap = shape.y - (bounds.y + bounds.height)
        return centerDiff <= Math.max(2, Math.min(8, shape.width * 0.1))
          && verticalGap >= -2
          && verticalGap <= 80
      })
      .sort((left, right) => {
        const leftGap = shape.y - (left.bounds.y + left.bounds.height)
        const rightGap = shape.y - (right.bounds.y + right.bounds.height)
        return leftGap - rightGap
      })[0]
    if (!candidate) continue
    usedLabels.add(candidate.id)
    component.companions?.push(candidate)
  }
  return components
}

export function buildViewEditorModels(
  config: FuxaConfig,
  Parser: SvgParserConstructor,
  measureBounds: MeasureSvgBounds,
): ViewEditorModelsResult {
  const models = new Map<string, ExportViewModel>()
  const errors = new Map<string, string>()
  const unsupported = new Map<string, string[]>()
  const duplicates = new Set<string>()
  const iconAssetIds = new Map(
    getIconLibrary(config).flatMap((icon) => getIconAssets(icon).map((asset) => [
      asset.dataUrl,
      asset.id,
    ] as const)),
  )
  const views = config.hmi.views

  for (const view of views) {
    if (!isRecord(view)) continue
    if (typeof view.id !== 'string' || !view.id) {
      errors.set('', '此 View 缺少有效 ID，為避免修改錯誤的 View，已設為唯讀。')
      continue
    }
    if (duplicates.has(view.id)) {
      errors.set(view.id, `配置中 View ID「${view.id}」重複，為避免匯出錯誤，此 View 設為唯讀。`)
      models.delete(view.id)
      continue
    }
    if (models.has(view.id) || errors.has(view.id)) {
      duplicates.add(view.id)
      models.delete(view.id)
      errors.set(view.id, `配置中 View ID「${view.id}」重複，為避免匯出錯誤，此 View 設為唯讀。`)
      continue
    }

    const parsed = readManaged(
      view,
      Parser,
      getFloorGroupArtifacts(config, view.id),
      iconAssetIds,
    )
    if (parsed.error) {
      errors.set(view.id, parsed.error)
      continue
    }

    const unsupportedItems = parsed.unmanaged.map((item) => `${item.name}：${item.reason}`)
    const components: ExportViewModel['components'] = [
      ...parsed.records,
      ...existingTagComponents(view, parsed, measureBounds, unsupportedItems),
    ]
    const titles = { ...(parsed.floorTitles ?? {}) }
    const titleIds = structuredClone(parsed.floorTitleIds ?? {})
    const frames = { ...(parsed.floorFrames ?? {}) }
    const frameIds = structuredClone(parsed.floorFrameIds ?? {})
    const model: ExportViewModel = {
      viewId: view.id,
      components,
      originalComponents: structuredClone(components),
      grid: getViewGridSettings(config, view.id),
      floorGroupFrame: getFloorGroupFrameSettings(config),
      floorTitles: titles,
      floorTitleIds: titleIds,
      floorFrames: frames,
      floorFrameIds: frameIds,
      floorFrameShapeIds: { ...(parsed.floorFrameShapeIds ?? {}) },
    }
    model.originalFloorTitleIds = structuredClone(titleIds)
    model.originalFloorFrameIds = structuredClone(frameIds)
    models.set(view.id, model)
    if (unsupportedItems.length) unsupported.set(view.id, unsupportedItems)
  }

  return { models, errors, unsupported }
}
