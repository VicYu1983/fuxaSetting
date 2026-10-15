import { isRecord } from '../config/validateFuxaConfig'
import { buildVisibilityActions } from '../icons/iconLibrary'
import type { SvgComponent } from './buildComponentNodes'

export interface ComponentItemEntries {
  shapeEntries: Record<string, unknown>[]
  labelEntry: Record<string, unknown>
}

const PALETTES = {
  normal: ['#00ff07ff', '#f80000ff'],
  alarm: ['#ff0000ff', '#00ff07ff'],
} as const

function propertyOf(item: unknown): Record<string, unknown> {
  return isRecord(item) && isRecord(item.property) ? item.property : {}
}

function preserveItem(
  existing: unknown,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(isRecord(existing) ? existing : {}),
    ...fields,
  }
}

function buildIconPairEntry(
  existing: unknown,
  component: SvgComponent,
  shape: Element,
): Record<string, unknown> {
  const dataName = shape.getAttribute('data-name') ?? ''
  const isNormalImage = dataName === `tc_${component.seq}`
  const normalVisibleValue = component.invertIconState ? 1 : 0
  const visibleValue = isNormalImage ? normalVisibleValue : 1 - normalVisibleValue
  const oldProperty = propertyOf(existing)
  const property: Record<string, unknown> = {
    ...oldProperty,
    ranges: [],
    events: Array.isArray(oldProperty.events) ? oldProperty.events : [],
    actions: buildVisibilityActions(component.tagId, visibleValue),
  }
  delete property.variableId
  return preserveItem(existing, {
    id: shape.getAttribute('id'),
    type: 'svg-ext-shapes-select',
    name: dataName,
    property,
    label: 'Shapes',
    hide: false,
    lock: false,
  })
}

function buildMultiStateEntry(
  existing: unknown,
  component: SvgComponent,
  shape: Element,
): Record<string, unknown> {
  const stateKey = shape.getAttribute('data-fuxa-state-key') ?? ''
  const binding = stateKey === 'normal'
    ? undefined
    : component.multiStateBindings?.find((candidate) => candidate.stateKey === stateKey)
  if (stateKey !== 'normal' && !binding) {
    throw new Error(`元件「${component.label || '未命名'}」找不到狀態「${stateKey}」的 Tag 綁定。`)
  }
  const oldProperty = propertyOf(existing)
  const property: Record<string, unknown> = {
    ...oldProperty,
    ranges: [],
    events: Array.isArray(oldProperty.events) ? oldProperty.events : [],
    actions: binding ? buildVisibilityActions(binding.tagId, 1) : [],
  }
  delete property.variableId
  return preserveItem(existing, {
    id: shape.getAttribute('id'),
    type: 'svg-ext-shapes-select',
    name: shape.getAttribute('data-name') ?? '',
    property,
    label: 'Shapes',
    hide: false,
    lock: false,
  })
}

function buildStandardEntry(
  existing: unknown,
  component: SvgComponent,
  shape: Element,
): Record<string, unknown> {
  const oldProperty = propertyOf(existing)
  const property: Record<string, unknown> = {
    ...oldProperty,
    variableId: component.tagId,
    ranges: PALETTES[component.palette].map((color, value) => ({
      min: value === 0 ? 1 : 0,
      max: value === 0 ? 1 : 0,
      color,
      type: 2,
      stroke: '',
    })),
  }
  if (!Array.isArray(property.events)) property.events = []
  if (!Array.isArray(property.actions)) property.actions = []
  return preserveItem(existing, {
    id: component.shapeId,
    type: shape.getAttribute('type'),
    name: `tc_${component.seq}`,
    property,
    label: 'Shapes',
    hide: false,
    lock: false,
  })
}

function buildLabelEntry(
  existing: unknown,
  component: SvgComponent,
): Record<string, unknown> {
  return preserveItem(existing, {
    id: component.labelId,
    type: 'svg-ext-shapes-text',
    name: `tc_${component.seq}_label`,
    property: null,
    label: 'Shapes',
    hide: false,
    lock: false,
  })
}

export function buildComponentEntries(
  component: SvgComponent,
  shapeNodes: readonly Element[],
  existing: {
    shape?: unknown
    alarmShape?: unknown
    states?: Record<string, unknown>
    label?: unknown
  } = {},
): ComponentItemEntries {
  if (component.template === 'icon-pair') {
    const normalShape = shapeNodes[0]
    const alarmShape = shapeNodes[1]
    if (!normalShape || !alarmShape) {
      throw new Error(`元件「${component.label || '未命名'}」的正常／告警圖示節點不完整。`)
    }
    return {
      shapeEntries: [
        buildIconPairEntry(existing.shape, component, normalShape),
        buildIconPairEntry(existing.alarmShape, component, alarmShape),
      ],
      labelEntry: buildLabelEntry(existing.label, component),
    }
  }

  if (component.template === 'icon-multi') {
    if (shapeNodes.length !== (component.multiStateBindings?.length ?? 0) + 1) {
      throw new Error(`元件「${component.label || '未命名'}」的多狀態圖示節點不完整。`)
    }
    return {
      shapeEntries: shapeNodes.map((shape) => {
        const id = shape.getAttribute('id') ?? ''
        return buildMultiStateEntry(
          id === component.shapeId ? existing.shape : existing.states?.[id],
          component,
          shape,
        )
      }),
      labelEntry: buildLabelEntry(existing.label, component),
    }
  }

  const shape = shapeNodes[0]
  if (!shape) throw new Error(`元件「${component.label || '未命名'}」缺少圖示節點。`)
  return {
    shapeEntries: [buildStandardEntry(existing.shape, component, shape)],
    labelEntry: buildLabelEntry(existing.label, component),
  }
}
