import type { FloorGroupFrameSettings, GridSettings } from '../config/types'
import type { FloorTag, FloorLayoutComponent } from '../layout/floorLayout'
import { getCanvasWidth, layoutFloorComponents } from '../layout/floorLayout'
import { applyExistingTagLayout } from './applyExistingTagLayout'
import { buildComponentEntries } from './buildComponentEntries'
import { buildComponentNodes } from './buildComponentNodes'
import type {
  IconAssetResolver,
  SvgComponent,
  SvgIdAllocator,
} from './buildComponentNodes'
import { buildFloorArtifactNodes } from './buildFloorArtifactNodes'
import { cleanupInactiveFloorArtifacts } from './cleanupInactiveFloorArtifacts'
import { ensureXlinkNamespace } from './ensureXlinkNamespace'
import { findSvgLayer } from './findSvgLayer'
import { insertFloorFrame } from './insertFloorFrame'
import { parseSvg } from './parseSvg'
import type { SvgParserConstructor } from './parseSvg'
import { removeManagedFromView } from './removeManagedFromView'
import type { MultiStateBinding } from './readManagedComponents'

export interface ApplyModelComponent extends FloorLayoutComponent {
  template?: string
  iconId?: string
  normalIconId?: string
  alarmIconId?: string
  alarmShapeId?: string
  invertIconState?: boolean
  multiIconSetId?: string
  multiStateBindings?: MultiStateBinding[]
  palette?: SvgComponent['palette']
  labelId?: string
  shapeInnerIds?: Array<string | null>
}

export interface ApplyModelView {
  id: string
  name?: string
  profile?: unknown
  svgcontent: string
  items: Record<string, unknown>
}

export interface ApplyModel {
  components: ApplyModelComponent[]
  originalComponents?: ApplyModelComponent[]
  grid: GridSettings
  floorTitles: Record<string, string>
  floorTitleIds: Record<string, string[]>
  floorFrames: Record<string, string>
  floorFrameIds: Record<string, string[]>
  floorFrameShapeIds: Record<string, string>
  originalFloorTitleIds?: Record<string, string[]>
  originalFloorFrameIds?: Record<string, string[]>
}

export interface ApplyModelToViewOptions {
  Parser: SvgParserConstructor
  serialize: (doc: XMLDocument) => string
  allocateId: SvgIdAllocator
  resolveIcon: IconAssetResolver
  tags: Map<string, FloorTag> | Record<string, FloorTag>
  floorGroupFrame: FloorGroupFrameSettings
}

function isManagedComponent(
  component: FloorLayoutComponent,
): component is FloorLayoutComponent & SvgComponent {
  return component.managed !== false
    && typeof component.seq === 'number'
    && typeof component.shapeId === 'string'
    && 'labelId' in component
    && typeof component.labelId === 'string'
    && 'shapeInnerIds' in component
    && Array.isArray(component.shapeInnerIds)
    && (component.template === 'rect'
      || component.template === 'cylinder'
      || component.template === 'switch'
      || component.template === 'icon'
      || component.template === 'icon-pair'
      || component.template === 'icon-multi')
    && (component.template !== 'icon-multi'
      || ('multiIconSetId' in component
        && typeof component.multiIconSetId === 'string'
        && 'normalIconId' in component
        && typeof component.normalIconId === 'string'
        && 'multiStateBindings' in component
        && Array.isArray(component.multiStateBindings)))
    && 'palette' in component
    && (component.palette === 'normal' || component.palette === 'alarm')
}

function existingItemItems(
  previousItems: Record<string, unknown>,
  component: SvgComponent,
): { shape?: unknown; alarmShape?: unknown; states?: Record<string, unknown>; label?: unknown } {
  return {
    shape: previousItems[component.shapeId],
    alarmShape: component.alarmShapeId
      ? previousItems[component.alarmShapeId]
      : undefined,
    states: Object.fromEntries(
      (component.multiStateBindings ?? []).map((binding) => [
        binding.shapeId,
        previousItems[binding.shapeId],
      ]),
    ),
    label: previousItems[component.labelId],
  }
}

function tagFor(
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
  tagId: string,
): FloorTag | undefined {
  return tags instanceof Map ? tags.get(tagId) : tags[tagId]
}

function writeComponentEntries(
  view: ApplyModelView,
  previousItems: Record<string, unknown>,
  component: SvgComponent,
  shapeNodes: Element[],
  tag: FloorTag | undefined,
): void {
  const entries = buildComponentEntries(
    component,
    shapeNodes,
    existingItemItems(previousItems, component),
    tag,
  )
  view.items[component.shapeId] = entries.shapeEntries[0]!
  if (component.template === 'icon-pair') {
    if (!component.alarmShapeId || !entries.shapeEntries[1]) {
      throw new Error(`元件「${component.label || '未命名'}」的正常／告警圖示項目不完整。`)
    }
    view.items[component.alarmShapeId] = entries.shapeEntries[1]
  }
  if (component.template === 'icon-multi') {
    for (const entry of entries.shapeEntries) {
      const id = entry.id
      if (typeof id !== 'string' || !id) {
        throw new Error(`元件「${component.label || '未命名'}」的多狀態圖示項目缺少 ID。`)
      }
      view.items[id] = entry
    }
  }
  view.items[component.labelId] = entries.labelEntry
}

function floorKey(floor: string): string {
  return `floor:${floor}`
}

function applyModelToViewInPlace(
  view: ApplyModelView,
  model: ApplyModel,
  options: ApplyModelToViewOptions,
): void {
  const doc = parseSvg(view.svgcontent, options.Parser)
  if (model.components.some(
    (component) => component.template === 'icon'
      || component.template === 'icon-pair'
      || component.template === 'icon-multi',
  )) {
    ensureXlinkNamespace(doc)
  }
  const layer = findSvgLayer(doc)
  if (!layer) {
    throw new Error(`View「${view.name || view.id}」找不到可安全插入元件的 SVG 圖層。`)
  }

  const previousItems = { ...view.items }
  removeManagedFromView(view, model, doc)
  const layout = layoutFloorComponents(
    model.components,
    model.grid,
    options.tags,
    options.floorGroupFrame,
    getCanvasWidth(view.profile),
  )

  for (const section of layout.sections) {
    const key = floorKey(section.floor)
    const frameId = model.floorFrames[key] || options.allocateId('svg')
    model.floorFrames[key] = frameId
    model.floorFrameIds[key] = [frameId]
    const frameShapeId = model.floorFrameShapeIds[key]
      || (model.floorFrameShapeIds[key] = options.allocateId('SHE'))
    const titleId = model.floorTitles[key] || options.allocateId('svg')
    model.floorTitles[key] = titleId
    model.floorTitleIds[key] = [titleId]
    const floorNodes = buildFloorArtifactNodes(
      doc,
      section,
      { titleId, frameId, frameShapeId },
      model.grid,
      options.floorGroupFrame,
      {
        title: previousItems[titleId],
        frame: previousItems[frameId],
      },
    )

    insertFloorFrame(layer, floorNodes.frameNode, section, doc)
    view.items[frameId] = floorNodes.frameEntry
    layer.appendChild(floorNodes.titleNode)
    view.items[titleId] = floorNodes.titleEntry

    for (const { component, placement } of section.entries) {
      if (component.managed === false) {
        if (!component.shapeId || !component.originalBounds) {
          throw new Error(`既有 Tag 元件 ${component.shapeId || component.key} 缺少位置資訊。`)
        }
        applyExistingTagLayout(doc, {
          shapeId: component.shapeId,
          originalBounds: component.originalBounds,
          companions: component.companions?.flatMap((companion) =>
            companion.id ? [{ id: companion.id }] : [],
          ),
        }, placement)
        continue
      }
      if (!isManagedComponent(component)) {
        throw new Error(`受管理元件「${component.key}」資料不完整，無法輸出 SVG。`)
      }

      const nodes = buildComponentNodes(
        doc,
        component,
        placement,
        model.grid,
        options.resolveIcon,
        options.allocateId,
      )
      for (const shapeNode of nodes.shapeNodes) layer.appendChild(shapeNode)
      layer.appendChild(nodes.labelNode)
      writeComponentEntries(
        view,
        previousItems,
        component,
        nodes.shapeNodes,
        tagFor(options.tags, component.tagId),
      )
    }
  }

  cleanupInactiveFloorArtifacts(model, layout.sections)
  view.svgcontent = options.serialize(doc)
}

function cloneComponents(
  components: readonly ApplyModelComponent[] | undefined,
): ApplyModelComponent[] | undefined {
  return components?.map((component) => ({
    ...component,
    shapeInnerIds: component.shapeInnerIds?.slice(),
    multiStateBindings: component.multiStateBindings?.map((binding) => ({ ...binding })),
    companions: component.companions?.map((companion) => ({
      ...companion,
      bounds: companion.bounds ? { ...companion.bounds } : undefined,
    })),
    originalBounds: component.originalBounds ? { ...component.originalBounds } : undefined,
  }))
}

export function applyModelToView(
  view: ApplyModelView,
  model: ApplyModel,
  options: ApplyModelToViewOptions,
): void {
  const stagedView: ApplyModelView = {
    ...view,
    items: { ...view.items },
  }
  const stagedModel: ApplyModel = {
    ...model,
    components: cloneComponents(model.components) ?? [],
    originalComponents: cloneComponents(model.originalComponents),
    floorTitles: { ...model.floorTitles },
    floorTitleIds: Object.fromEntries(
      Object.entries(model.floorTitleIds).map(([key, ids]) => [key, [...ids]]),
    ),
    floorFrames: { ...model.floorFrames },
    floorFrameIds: Object.fromEntries(
      Object.entries(model.floorFrameIds).map(([key, ids]) => [key, [...ids]]),
    ),
    floorFrameShapeIds: { ...model.floorFrameShapeIds },
    originalFloorTitleIds: model.originalFloorTitleIds
      ? Object.fromEntries(
        Object.entries(model.originalFloorTitleIds).map(([key, ids]) => [key, [...ids]]),
      )
      : undefined,
    originalFloorFrameIds: model.originalFloorFrameIds
      ? Object.fromEntries(
        Object.entries(model.originalFloorFrameIds).map(([key, ids]) => [key, [...ids]]),
      )
      : undefined,
  }

  applyModelToViewInPlace(stagedView, stagedModel, options)
  Object.assign(view, stagedView)
  Object.assign(model, stagedModel)
}
