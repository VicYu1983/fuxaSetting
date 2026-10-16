import { isRecord } from '../config/validateFuxaConfig'
import type { FloorGroupFrameSettings, GridSettings } from '../config/types'
import type { FloorTag, FloorLayoutComponent } from '../layout/floorLayout'
import { layoutFloorComponents } from '../layout/floorLayout'
import { findSvgElementById, parseSvg } from './parseSvg'
import type { SvgParserConstructor } from './parseSvg'
import { existingTagTransform } from './existingTagTransform'
import type { IconLibraryEntry } from '../icons/iconLibrary'

const FLOOR_LAYOUT_MARKER = 'floor-layout-v1'
const FLOOR_TITLE_NAME = 'fuxa_floor_section_title'
const FLOOR_FRAME_NAME = 'fuxa_floor_section_frame'

export interface GeneratedComponent extends FloorLayoutComponent {
  template?: string
  palette?: 'normal' | 'alarm'
  iconId?: string
  normalIconId?: string
  alarmIconId?: string
  shapeId: string
  labelId?: string
  alarmShapeId?: string
  invertIconState?: boolean
  multiIconSetId?: string
  multiStateBindings?: Array<{
    stateKey: string
    iconId: string
    tagId: string
    shapeId: string
  }>
  shapeInnerIds?: Array<string | null>
}

export interface GeneratedViewModel {
  viewId: string
  components: GeneratedComponent[]
  originalComponents?: GeneratedComponent[]
  grid: GridSettings
  floorGroupFrame: FloorGroupFrameSettings
  floorTitles: Record<string, string>
  floorTitleIds: Record<string, string[]>
  floorFrames: Record<string, string>
  floorFrameIds: Record<string, string[]>
}

export interface GeneratedView {
  id: string
  name?: string
  svgcontent: string
  items: unknown
}

export interface ValidateGeneratedViewOptions {
  Parser: SvgParserConstructor
  tags: Map<string, FloorTag> | Record<string, FloorTag>
  models: readonly GeneratedViewModel[]
  createdIds?: ReadonlySet<string>
  iconLibrary?: readonly IconLibraryEntry[]
}

function viewLabel(view: GeneratedView): string {
  return view.name || view.id
}

function tagExists(tags: Map<string, FloorTag> | Record<string, FloorTag>, id: string): boolean {
  return tags instanceof Map ? tags.has(id) : Object.prototype.hasOwnProperty.call(tags, id)
}

function tagFor(
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
  id: string,
): FloorTag | undefined {
  return tags instanceof Map ? tags.get(id) : tags[id]
}

function tagProperty(item: unknown): Record<string, unknown> {
  return isRecord(item) && isRecord(item.property) ? item.property : {}
}

function hasSwitchClickBinding(property: Record<string, unknown>, tagId: string): boolean {
  return Array.isArray(property.events) && property.events.some((event) => {
    if (!isRecord(event) || event.type !== 'click' || event.action !== 'onToggleValue'
        || !isRecord(event.actoptions)) return false
    const variable = event.actoptions.variable
    return isRecord(variable) && variable.variableId === tagId
  })
}

function hasVisibilityRule(actions: unknown, tagId: string, visibleValue: number): boolean {
  if (!Array.isArray(actions)) return false
  return [0, 1].every((value) => actions.some((action) =>
    isRecord(action)
      && action.variableId === tagId
      && isRecord(action.range)
      && action.range.min === value
      && action.range.max === value
      && action.type === (value === visibleValue ? 'show' : 'hide'),
  ))
}

function itemName(items: Record<string, unknown>, id: string | undefined): unknown {
  if (!id) return undefined
  const item = items[id]
  return isRecord(item) ? item.name : undefined
}

function validateViewItemIds(view: GeneratedView, items: Record<string, unknown>): void {
  for (const [id, item] of Object.entries(items)) {
    if (!isRecord(item) || item.id !== id) {
      throw new Error(`View「${viewLabel(view)}」存在不一致的 item id：${id}`)
    }
  }
}

function validateExistingTag(
  items: Record<string, unknown>,
  doc: XMLDocument,
  component: GeneratedComponent,
  placements: ReturnType<typeof layoutFloorComponents>['placements'],
): void {
  const node = findSvgElementById(doc, component.shapeId)
  const item = items[component.shapeId]
  if (!node || !isRecord(item) || tagProperty(item).variableId !== component.tagId) {
    throw new Error(`既有 Tag 元件 ${component.shapeId} 的 SVG 或 Tag 綁定未保留。`)
  }

  const entry = placements.find(({ component: placed }) => placed.key === component.key)
  const transform = component.originalBounds && entry
    ? existingTagTransform(component.originalBounds, entry.placement.shape)
    : null
  if (!entry || (node.getAttribute('transform') || '') !== transform
      || (node.getAttribute('data-fuxa-floor-layout') || '') !==
        (transform ? FLOOR_LAYOUT_MARKER : '')) {
    throw new Error(`既有 Tag 元件 ${component.shapeId} 的新位置未正確寫入 SVG。`)
  }
  for (const companion of component.companions ?? []) {
    if (!companion.id) continue
    const labelNode = findSvgElementById(doc, companion.id)
    if (!labelNode
        || (labelNode.getAttribute('transform') || '') !== transform
        || (labelNode.getAttribute('data-fuxa-floor-layout') || '') !==
          (transform ? FLOOR_LAYOUT_MARKER : '')) {
      throw new Error(`既有 Tag 元件 ${component.shapeId} 的對應文字標籤未同步移動。`)
    }
  }

}

function validateManagedComponent(
  view: GeneratedView,
  items: Record<string, unknown>,
  doc: XMLDocument,
  tags: Map<string, FloorTag> | Record<string, FloorTag>,
  component: GeneratedComponent,
  iconLibrary?: readonly IconLibraryEntry[],
): void {
  const normalNode = findSvgElementById(doc, component.shapeId)
  const alarmNode = component.alarmShapeId
    ? findSvgElementById(doc, component.alarmShapeId)
    : null
  const labelNode = component.labelId ? findSvgElementById(doc, component.labelId) : null
  if (!normalNode || (component.template === 'icon-pair' && !alarmNode) || !labelNode) {
    throw new Error(`View「${viewLabel(view)}」的元件與 Label 未同步寫入 SVG。`)
  }

  if (component.template === 'icon-pair'
      && (normalNode.localName !== 'image'
        || alarmNode?.localName !== 'image'
        || !normalNode.parentNode
        || !alarmNode.parentNode
        || normalNode.parentNode !== alarmNode.parentNode
        || (normalNode.parentNode as Element).hasAttribute('data-fuxa-icon-pair-wrapper')
        || ['x', 'y', 'width', 'height'].some(
          (attribute) => normalNode.getAttribute(attribute) !== alarmNode.getAttribute(attribute),
        ))) {
    throw new Error(`元件 ${component.shapeId} 的正常／告警圖示未輸出為同層且重疊的獨立圖片。`)
  }

  if (!items[component.shapeId]
      || (component.template === 'icon-pair'
        && (!component.alarmShapeId || !items[component.alarmShapeId]))
      || (component.template === 'icon-multi'
        && (component.multiStateBindings ?? []).some((binding) => !items[binding.shapeId]))
      || !component.labelId
      || !items[component.labelId]) {
    throw new Error(`View「${viewLabel(view)}」缺少元件或 Label 的 items 記錄。`)
  }

  if (component.template !== 'icon-multi'
      && (!component.tagId || !tagExists(tags, component.tagId))) {
    throw new Error(
      `元件 ${component.shapeId} 連結到不存在的 Tag：${component.tagId || '(空白)'}`,
    )
  }

  if (component.template === 'icon-pair') {
    const normalActions = tagProperty(items[component.shapeId]).actions
    const alarmActions = component.alarmShapeId
      ? tagProperty(items[component.alarmShapeId]).actions
      : undefined
    const normalVisibleValue = component.invertIconState ? 1 : 0
    if (!hasVisibilityRule(normalActions, component.tagId, normalVisibleValue)
        || !hasVisibilityRule(alarmActions, component.tagId, 1 - normalVisibleValue)) {
      throw new Error(`元件 ${component.shapeId} 的正常／告警圖示可見條件未正確寫入。`)
    }
    const tag = tagFor(tags, component.tagId)
    if (!tag || !['bool', 'boolean'].includes(String(tag.type ?? '').toLocaleLowerCase())) {
      throw new Error(`元件 ${component.shapeId} 的正常／告警圖示顯示條件需要 Boolean Tag。`)
    }
  } else if (component.template === 'icon-multi') {
    validateMultiStateComponent(items, doc, normalNode, tags, component, iconLibrary)
  } else if (component.template === 'switch') {
    const switchItem = items[component.shapeId]
    const property = tagProperty(switchItem)
    const tag = tagFor(tags, component.tagId)
    const foreignObject = normalNode.querySelector('foreignObject')
    if (normalNode.getAttribute('type') !== 'svg-ext-html_switch'
        || !isRecord(switchItem) || switchItem.type !== 'svg-ext-html_switch'
        || !hasSwitchClickBinding(property, component.tagId)
        || !tag || String(tag.memaddress ?? '').trim() !== '000000'
        || !['bool', 'boolean'].includes(String(tag.type ?? '').toLocaleLowerCase())
        || !foreignObject
        || foreignObject.getAttribute('width') !== '50'
        || foreignObject.getAttribute('height') !== '28') {
      throw new Error(`元件「${component.label || component.shapeId}」的 Coil Switch 或 click Tag 綁定不正確。`)
    }
  } else if (tagProperty(items[component.shapeId]).variableId !== component.tagId) {
    throw new Error(`元件 ${component.shapeId} 的 Tag 連結與清單不一致。`)
  }

  if ((labelNode.textContent || '') !== component.label) {
    throw new Error(`元件 ${component.shapeId} 的文字標籤未正確寫入 SVG。`)
  }

  if (component.template !== 'icon-pair'
      && component.template !== 'icon-multi'
      && component.template !== 'switch') {
    const expectedColors = component.palette === 'alarm'
      ? ['#ff0000ff', '#00ff07ff']
      : ['#00ff07ff', '#f80000ff']
    const ranges = tagProperty(items[component.shapeId]).ranges
    if (!Array.isArray(ranges)
        || ranges.length !== expectedColors.length
        || ranges.some((range, index) =>
          !isRecord(range) || range.color !== expectedColors[index])) {
      throw new Error(`元件 ${component.shapeId} 的顏色狀態未正確寫入。`)
    }
  }

  function validateMultiStateComponent(
    items: Record<string, unknown>,
    doc: XMLDocument,
    normalNode: Element,
    tags: Map<string, FloorTag> | Record<string, FloorTag>,
    component: GeneratedComponent,
    iconLibrary?: readonly IconLibraryEntry[],
  ): void {
    const bindings = component.multiStateBindings ?? []
    if (!component.multiIconSetId || !component.normalIconId || bindings.length < 1) {
      throw new Error(`元件「${component.label || component.shapeId}」的多狀態圖示組設定不完整。`)
    }
    if (normalNode.localName !== 'image'
        || normalNode.getAttribute('data-fuxa-icon-set-id') !== component.multiIconSetId
        || normalNode.getAttribute('data-fuxa-state-key') !== 'normal'
        || normalNode.getAttribute('data-fuxa-icon-id') !== component.normalIconId) {
      throw new Error(`元件 ${component.shapeId} 的正常圖示未連結至正確的多狀態圖示組。`)
    }
    const iconSet = iconLibrary?.find((icon) =>
      icon.type === 'multi-state' && icon.id === component.multiIconSetId)
    if (iconLibrary && (!iconSet || iconSet.type !== 'multi-state'
        || iconSet.normal.id !== component.normalIconId
        || iconSet.states.length !== bindings.length
        || iconSet.states.some((state, index) =>
          state.key !== bindings[index]?.stateKey || state.asset.id !== bindings[index]?.iconId))) {
      throw new Error(`元件「${component.label || component.shapeId}」引用的多狀態圖示組已變更或不存在。`)
    }
    const expectedStackIds = [
      component.shapeId,
      ...bindings.slice().reverse().map((binding) => binding.shapeId),
    ]
    const componentNamePrefix = `tc_${component.seq}`
    const actualStackIds = Array.from(doc.getElementsByTagName('*'))
      .filter((node) => node.parentNode === normalNode.parentNode
        && node.getAttribute('data-fuxa-icon-set-id') === component.multiIconSetId
        && (node.getAttribute('data-name') === componentNamePrefix
          || node.getAttribute('data-name')?.startsWith(`${componentNamePrefix}_state_`)))
      .map((node) => node.getAttribute('id') || '')
    if (JSON.stringify(actualStackIds) !== JSON.stringify(expectedStackIds)) {
      throw new Error(`元件「${component.label || component.shapeId}」的狀態圖層順序與優先順序不一致。`)
    }
    const normalItem = items[component.shapeId]
    const normalProperty = tagProperty(normalItem)
    if (normalProperty.variableId !== undefined
        || !Array.isArray(normalProperty.actions)
        || normalProperty.actions.length !== 0) {
      throw new Error(`元件「${component.label || component.shapeId}」的預設／正常圖示不應有 Tag 顯示條件。`)
    }
    const bounds = ['x', 'y', 'width', 'height']
    const parent = normalNode.parentNode
    const seenTags = new Set<string>()
    for (const [priority, binding] of bindings.entries()) {
      if (!binding.tagId || !tagExists(tags, binding.tagId)) {
        throw new Error(
          `元件「${component.label || component.shapeId}」的狀態「${binding.stateKey}」尚未綁定有效 Tag。`,
        )
      }
      if (seenTags.has(binding.tagId)) {
        throw new Error(`元件「${component.label || component.shapeId}」不能在多個狀態重複使用同一 Tag。`)
      }
      seenTags.add(binding.tagId)
      const tag = tagFor(tags, binding.tagId)
      if (!tag || !['bool', 'boolean'].includes(String(tag.type ?? '').toLocaleLowerCase())) {
        throw new Error(
          `元件「${component.label || component.shapeId}」的狀態「${binding.stateKey}」需要 Boolean Tag。`,
        )
      }
      const node = findSvgElementById(doc, binding.shapeId)
      const item = items[binding.shapeId]
      if (!node || node.localName !== 'image'
          || node.parentNode !== parent
          || node.getAttribute('data-fuxa-icon-set-id') !== component.multiIconSetId
          || node.getAttribute('data-fuxa-state-key') !== binding.stateKey
          || node.getAttribute('data-fuxa-icon-id') !== binding.iconId
          || node.getAttribute('data-fuxa-state-priority') !== String(priority)
          || bounds.some((attribute) =>
            node.getAttribute(attribute) !== normalNode.getAttribute(attribute))
          || !isRecord(item)
          || item.type !== 'svg-ext-shapes-select'
          || tagProperty(item).variableId !== undefined
          || !hasVisibilityRule(tagProperty(item).actions, binding.tagId, 1)) {
        throw new Error(
          `元件「${component.label || component.shapeId}」的狀態「${binding.stateKey}」圖示或可見條件未正確輸出。`,
        )
      }
    }
    if (component.tagId !== bindings[0]?.tagId) {
      throw new Error(`元件「${component.label || component.shapeId}」的主要 Tag 與最高優先狀態不一致。`)
    }
  }

}

function validateFloorArtifacts(
  view: GeneratedView,
  items: Record<string, unknown>,
  doc: XMLDocument,
  model: GeneratedViewModel,
  sections: ReturnType<typeof layoutFloorComponents>['sections'],
): void {
  for (const section of sections) {
    const key = `floor:${section.floor}`
    const titleId = model.floorTitles[key]
    const titleNode = titleId ? findSvgElementById(doc, titleId) : null
    if (!titleNode
        || itemName(items, titleId) !== FLOOR_TITLE_NAME
        || titleNode.textContent !== section.title
        || titleNode.getAttribute('data-floor-group') !== section.floor) {
      throw new Error(`View「${viewLabel(view)}」的「${section.title}」樓層標題未正確寫入。`)
    }
    const frameId = model.floorFrames[key]
    const frameNode = frameId ? findSvgElementById(doc, frameId) : null
    if (!frameNode
        || itemName(items, frameId) !== FLOOR_FRAME_NAME
        || frameNode.getAttribute('data-floor-group') !== section.floor) {
      throw new Error(`View「${viewLabel(view)}」的「${section.title}」樓層底框未正確寫入。`)
    }
    if ((model.floorTitleIds[key] ?? []).length !== 1
        || (model.floorFrameIds[key] ?? []).length !== 1) {
      throw new Error(`View「${viewLabel(view)}」的「${section.title}」樓層元件仍有重複項目。`)
    }
  }

  const expectedCount = sections.length
  const titleCount = Object.values(items)
    .filter((item) => isRecord(item) && item.name === FLOOR_TITLE_NAME).length
  const frameCount = Object.values(items)
    .filter((item) => isRecord(item) && item.name === FLOOR_FRAME_NAME).length
  if (titleCount !== expectedCount || frameCount !== expectedCount) {
    throw new Error(`View「${viewLabel(view)}」的樓層標題或底框數量與分組不一致。`)
  }
}

function validateDeletedComponents(
  view: GeneratedView,
  items: Record<string, unknown>,
  doc: XMLDocument,
  model: GeneratedViewModel,
): void {
  for (const original of model.originalComponents ?? []) {
    if (original.managed === false) continue
    const current = model.components.find((component) =>
      component.managed !== false && component.shapeId === original.shapeId)
    const currentIdsForComponent = new Set(
      current
        ? [
          current.shapeId,
          current.alarmShapeId,
          current.labelId,
          ...(current.multiStateBindings ?? []).map((binding) => binding.shapeId),
        ].filter((id): id is string => Boolean(id))
        : [],
    )
    const originalIds = [
      original.shapeId,
      original.alarmShapeId,
      original.labelId,
      ...(original.multiStateBindings ?? []).map((binding) => binding.shapeId),
    ].filter((id): id is string => Boolean(id))
    if (originalIds.some((id) => !currentIdsForComponent.has(id)
        && (items[id] || findSvgElementById(doc, id)))) {
      throw new Error(`已刪除的元件 ${original.shapeId} 仍留在輸出配置中。`)
    }
  }
  void view
}

export function validateGeneratedView(
  view: GeneratedView,
  model: GeneratedViewModel,
  options: Pick<ValidateGeneratedViewOptions, 'Parser' | 'tags' | 'iconLibrary'>,
): XMLDocument {
  if (!isRecord(view.items)) {
    throw new Error(`View「${viewLabel(view)}」的 items 結構無效。`)
  }
  const items = view.items
  const doc = parseSvg(view.svgcontent, options.Parser)
  validateViewItemIds(view, items)

  const layout = layoutFloorComponents(
    model.components,
    model.grid,
    options.tags,
    model.floorGroupFrame,
  )
  for (const component of model.components) {
    if (component.managed === false) {
      validateExistingTag(items, doc, component, layout.placements)
      continue
    }
    validateManagedComponent(view, items, doc, options.tags, component, options.iconLibrary)
  }
  validateFloorArtifacts(view, items, doc, model, layout.sections)
  validateDeletedComponents(view, items, doc, model)
  return doc
}

export function validateGeneratedViews(
  views: readonly GeneratedView[],
  modifiedViewIds: ReadonlySet<string>,
  models: readonly GeneratedViewModel[],
  options: Omit<ValidateGeneratedViewOptions, 'models'>,
): void {
  const createdIdCounts = new Map(Array.from(options.createdIds ?? [], (id) => [id, 0]))

  for (const view of views) {
    if (!modifiedViewIds.has(view.id)) continue
    const model = models.find((candidate) => candidate.viewId === view.id)
    if (!model) continue
    const doc = validateGeneratedView(view, model, options)
    for (const node of Array.from(doc.getElementsByTagName('*'))) {
      const id = node.getAttribute('id')
      if (id && createdIdCounts.has(id)) {
        createdIdCounts.set(id, (createdIdCounts.get(id) ?? 0) + 1)
      }
    }
  }

  for (const [id, count] of createdIdCounts) {
    if (count > 1) throw new Error(`新元件 ID ${id} 在 SVG 中重複出現。`)
  }
}
