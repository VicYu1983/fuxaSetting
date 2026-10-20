import { isRecord } from '../config/validateFuxaConfig'
import type { IconAsset, MultiStateIconSet } from '../icons/iconLibrary'

const MANAGED_NAME = /^tc_(\d+)$/
const ALARM_PALETTE_FIRST_COLOR = '#ff0000ff'

export interface MultiStateBinding {
  stateKey: string
  iconId: string
  tagId: string
  shapeId: string
}

export interface ManagedComponentRecord {
  key: string
  seq: number
  tagId: string
  label: string
  template: 'icon-multi' | 'icon-pair' | 'icon' | 'cylinder' | 'switch' | 'rect'
  iconId?: string
  normalIconId?: string
  alarmIconId?: string
  alarmShapeId?: string
  invertIconState?: boolean
  multiIconSetId?: string
  multiStateBindings?: MultiStateBinding[]
  palette: 'normal' | 'alarm'
  shapeId: string
  labelId: string
  shapeInnerIds: Array<string | null>
  managed: true
}

export interface ReadManagedComponentsResult {
  records: ManagedComponentRecord[]
  consumed: Set<string>
}

function itemName(item: unknown): string {
  return isRecord(item) && typeof item.name === 'string' ? item.name : ''
}

function findById(doc: XMLDocument, id: string): Element | null {
  for (const element of Array.from(doc.getElementsByTagName('*'))) {
    if (element.getAttribute('id') === id) return element
  }
  return null
}

function actionsFor(item: unknown): unknown[] {
  if (!isRecord(item) || !isRecord(item.property) || !Array.isArray(item.property.actions)) {
    return []
  }
  return item.property.actions
}

function switchTagId(item: unknown): string {
  if (!isRecord(item) || !isRecord(item.property)
      || !Array.isArray(item.property.events)) return ''
  for (const event of item.property.events) {
    if (!isRecord(event) || !isRecord(event.actoptions)
        || !isRecord(event.actoptions.variable)) continue
    const variableId = event.actoptions.variable.variableId
    if (typeof variableId === 'string') return variableId
  }
  return ''
}

function actionVariableId(action: unknown): string | undefined {
  return isRecord(action) && typeof action.variableId === 'string'
    ? action.variableId
    : undefined
}

function isVisibleAtZero(action: unknown, variableId: string): boolean {
  if (!isRecord(action) || !isRecord(action.range)) return false
  return action.variableId === variableId
    && action.range.min === 0
    && action.range.max === 0
    && action.type === 'show'
}

function innerIds(node: Element): Array<string | null> {
  return Array.from(node.querySelectorAll('[id]')).map((element) => element.getAttribute('id'))
}

interface MultiStateNodeBinding {
  stateKey: string
  iconId: string
  tagId: string
  shapeId: string
  priority: number
}

function multiStateNodesFromSvg(
  items: Record<string, unknown>,
  doc: XMLDocument,
  seq: number,
  iconSetId: string,
  iconSet: MultiStateIconSet | undefined,
  iconAssetIds: ReadonlyMap<string, string>,
): MultiStateNodeBinding[] {
  return Array.from(doc.getElementsByTagName('*'))
    .filter((node) =>
      node.getAttribute('data-fuxa-icon-set-id') === iconSetId
      && node.getAttribute('data-name')?.startsWith(`tc_${seq}_state_`)
      && node.getAttribute('data-fuxa-state-key')
      && node.getAttribute('data-fuxa-state-key') !== 'normal')
    .map((node) => {
      const stateKey = node.getAttribute('data-fuxa-state-key') || ''
      const id = node.getAttribute('id') || ''
      const actions = actionsFor(items[id])
      const stateAssetId = iconSet?.states.find((state) => state.key === stateKey)?.asset.id
      return {
        stateKey,
        iconId: node.getAttribute('data-fuxa-icon-id')
          || stateAssetId
          || findIconAssetId(node, iconAssetIds),
        tagId: actions.map(actionVariableId)
          .find((variableId): variableId is string => variableId !== undefined) ?? '',
        shapeId: id,
        priority: Number(node.getAttribute('data-fuxa-state-priority')),
      }
    })
    .filter((binding) => binding.stateKey && binding.shapeId)
    .sort((left, right) => left.priority - right.priority)
}

// Matches by explicit id or by data URL against this asset only. Several library
// icons can share one data URL, so a shared URL-to-id map cannot pick the right set.
function matchesIconAsset(node: Element, asset: IconAsset): boolean {
  if (node.getAttribute('data-fuxa-icon-id') === asset.id) return true
  return (node.getAttribute('href') || node.getAttribute('xlink:href')) === asset.dataUrl
}

function recoverMultiStateIconSet(
  shapeNode: Element,
  items: Record<string, unknown>,
  itemIds: readonly string[],
  doc: XMLDocument,
  seq: number,
  iconSets: readonly MultiStateIconSet[],
): { iconSet: MultiStateIconSet; bindings: MultiStateNodeBinding[] } | undefined {
  for (const iconSet of iconSets) {
    if (!matchesIconAsset(shapeNode, iconSet.normal)) continue
    const bindings = recoverStateBindings(iconSet, items, itemIds, doc, seq)
    if (bindings) return { iconSet, bindings }
  }
  return undefined
}

function recoverStateBindings(
  iconSet: MultiStateIconSet,
  items: Record<string, unknown>,
  itemIds: readonly string[],
  doc: XMLDocument,
  seq: number,
): MultiStateNodeBinding[] | undefined {
  const bindings: MultiStateNodeBinding[] = []
  for (const [priority, state] of iconSet.states.entries()) {
    const stateItemId = itemIds.find((id) => (
      itemName(items[id]) === `tc_${seq}_state_${state.key}`
      && isRecord(items[id])
      && items[id].type === 'svg-ext-shapes-select'
    ))
    const stateNode = stateItemId ? findById(doc, stateItemId) : null
    if (!stateItemId || !stateNode || stateNode.localName !== 'image'
        || !matchesIconAsset(stateNode, state.asset)) {
      return undefined
    }
    const tagId = actionsFor(items[stateItemId])
      .map(actionVariableId)
      .find((variableId): variableId is string => variableId !== undefined)
    if (!tagId) return undefined
    bindings.push({
      stateKey: state.key,
      iconId: state.asset.id,
      tagId,
      shapeId: stateItemId,
      priority,
    })
  }
  return bindings
}

export function readManagedComponents(
  items: Record<string, unknown>,
  doc: XMLDocument,
  alreadyConsumed: ReadonlySet<string> = new Set(),
  iconAssetIds: ReadonlyMap<string, string> = new Map(),
  iconSets: readonly MultiStateIconSet[] = [],
): ReadManagedComponentsResult {
  const records: ManagedComponentRecord[] = []
  const consumed = new Set(alreadyConsumed)
  const itemIds = Object.keys(items)
  const svgOrder = new Map(
    Array.from(doc.getElementsByTagName('*'))
      .flatMap((node, index) => {
        const id = node.getAttribute('id')
        return id ? [[id, index] as const] : []
      }),
  )

  for (const [shapeId, shapeItem] of Object.entries(items)) {
    if (consumed.has(shapeId)) continue
    const match = MANAGED_NAME.exec(itemName(shapeItem))
    if (!match || !isRecord(shapeItem) || shapeItem.id !== shapeId) continue
    const seq = Number(match[1])
    const labelId = itemIds.find((id) => {
      const candidate = items[id]
      return itemName(candidate) === `tc_${seq}_label`
        && isRecord(candidate)
        && candidate.type === 'svg-ext-shapes-text'
    })
    if (!labelId) continue

    const shapeNode = findById(doc, shapeId)
    const labelNode = findById(doc, labelId)
    if (!shapeNode || !labelNode || labelNode.localName !== 'text') continue
    const explicitIconSetId = shapeNode.getAttribute('data-fuxa-icon-set-id') || ''
    const recovered = explicitIconSetId
      ? undefined
      : recoverMultiStateIconSet(
        shapeNode,
        items,
        itemIds,
        doc,
        seq,
        iconSets,
      )
    const multiIconSet = recovered?.iconSet
      ?? (explicitIconSetId ? iconSets.find((set) => set.id === explicitIconSetId) : undefined)
    const multiIconSetId = explicitIconSetId || recovered?.iconSet.id || ''
    const multiStateNodes = explicitIconSetId
      ? multiStateNodesFromSvg(
        items,
        doc,
        seq,
        explicitIconSetId,
        multiIconSet,
        iconAssetIds,
      )
      : recovered?.bindings ?? []

    const alarmItemId = itemIds.find((id) => {
      const candidate = items[id]
      return itemName(candidate) === `tc_${seq}_alarm`
        && isRecord(candidate)
        && candidate.type === 'svg-ext-shapes-select'
    })
    const alarmNode = alarmItemId ? findById(doc, alarmItemId) : null
    const normalActions = actionsFor(shapeItem)
    const alarmItem = alarmItemId ? items[alarmItemId] : undefined
    const alarmActions = actionsFor(alarmItem)
    const visibilityTagId = normalActions
      .map(actionVariableId)
      .find((variableId): variableId is string => variableId !== undefined) ?? ''
    const normalVisibleAtZero = normalActions.some(
      (action) => isVisibleAtZero(action, visibilityTagId),
    )
    const alarmVisibleAtZero = alarmActions.some(
      (action) => isVisibleAtZero(action, visibilityTagId),
    )
    const isIconPair = shapeItem.type === 'svg-ext-shapes-select'
      && isRecord(alarmItem)
      && isRecord(alarmItem.property)
      && alarmNode !== null
      && shapeNode.localName === 'image'
      && alarmNode.localName === 'image'
      && Boolean(visibilityTagId)
      && normalActions.length >= 2
      && alarmActions.length >= 2
      && alarmActions.every((action) => actionVariableId(action) === visibilityTagId)

    const iconNode = shapeNode.querySelector('image[data-fuxa-icon-id]')
    const iconId = findIconAssetId(shapeNode, iconAssetIds)
      || (iconNode ? findIconAssetId(iconNode, iconAssetIds) : '')
    const normalIconId = multiIconSet?.normal.id ?? findIconAssetId(shapeNode, iconAssetIds)
    const alarmIconId = alarmNode ? findIconAssetId(alarmNode, iconAssetIds) : ''
    const isSwitch = shapeItem.type === 'svg-ext-html_switch'
    const shapeType = isSwitch
      ? 'switch'
      : multiIconSetId
      ? 'icon-multi'
      : isIconPair
      ? 'icon-pair'
      : iconId
        ? 'icon'
        : shapeItem.type === 'svg-ext-shapes-cylinder'
          ? 'cylinder'
          : 'rect'
    const ranges = isRecord(shapeItem.property) && Array.isArray(shapeItem.property.ranges)
      ? shapeItem.property.ranges
      : []
    const firstColor = ranges.length > 0 && isRecord(ranges[0]) ? ranges[0].color : undefined
    const palette = firstColor === ALARM_PALETTE_FIRST_COLOR ? 'alarm' : 'normal'
    const variableId = isRecord(shapeItem.property)
      && typeof shapeItem.property.variableId === 'string'
      ? shapeItem.property.variableId
      : ''
    const record: ManagedComponentRecord = {
      key: `loaded-${seq}`,
      seq,
      tagId: multiIconSetId
        ? multiStateNodes[0]?.tagId ?? ''
        : isIconPair ? visibilityTagId : isSwitch ? switchTagId(shapeItem) : variableId,
      label: labelNode.textContent || '',
      template: shapeType,
      ...(iconId && !isIconPair ? { iconId } : {}),
      ...(isIconPair ? {
        normalIconId,
        alarmIconId,
        alarmShapeId: alarmItemId,
        invertIconState: !normalVisibleAtZero && alarmVisibleAtZero,
      } : {}),
      ...(multiIconSetId ? {
        multiIconSetId,
        normalIconId,
        multiStateBindings: multiStateNodes.map((binding) => ({
          stateKey: binding.stateKey,
          iconId: binding.iconId,
          tagId: binding.tagId,
          shapeId: binding.shapeId,
        })),
      } : {}),
      palette,
      shapeId,
      labelId,
      shapeInnerIds: isIconPair ? [] : innerIds(shapeNode),
      managed: true,
    }
    records.push(record)
    consumed.add(shapeId)
    if (isIconPair && alarmItemId) consumed.add(alarmItemId)
    for (const binding of multiStateNodes) consumed.add(binding.shapeId)
    consumed.add(labelId)
  }

  records.sort((left, right) => (
    (svgOrder.get(left.shapeId) ?? Number.MAX_SAFE_INTEGER)
      - (svgOrder.get(right.shapeId) ?? Number.MAX_SAFE_INTEGER)
    || left.seq - right.seq
  ))
  return { records, consumed }
}

function findIconAssetId(node: Element, iconAssetIds: ReadonlyMap<string, string>): string {
  const explicitId = node.getAttribute('data-fuxa-icon-id')
  if (explicitId) return explicitId
  const imageUrl = node.getAttribute('href') || node.getAttribute('xlink:href')
  return imageUrl ? iconAssetIds.get(imageUrl) ?? '' : ''
}
