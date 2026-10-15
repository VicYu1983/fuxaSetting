import { isRecord } from '../config/validateFuxaConfig'

const MANAGED_NAME = /^tc_(\d+)$/
const ALARM_PALETTE_FIRST_COLOR = '#ff0000ff'

export interface ManagedComponentRecord {
  key: string
  seq: number
  tagId: string
  label: string
  template: 'icon-pair' | 'icon' | 'cylinder' | 'rect'
  iconId?: string
  normalIconId?: string
  alarmIconId?: string
  alarmShapeId?: string
  invertIconState?: boolean
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

export function readManagedComponents(
  items: Record<string, unknown>,
  doc: XMLDocument,
  alreadyConsumed: ReadonlySet<string> = new Set(),
): ReadManagedComponentsResult {
  const records: ManagedComponentRecord[] = []
  const consumed = new Set(alreadyConsumed)
  const itemIds = Object.keys(items)

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
    const iconId = shapeNode.getAttribute('data-fuxa-icon-id')
      || iconNode?.getAttribute('data-fuxa-icon-id')
      || ''
    const shapeType = isIconPair
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
      tagId: isIconPair ? visibilityTagId : variableId,
      label: labelNode.textContent || '',
      template: shapeType,
      ...(iconId && !isIconPair ? { iconId } : {}),
      ...(isIconPair ? {
        normalIconId: shapeNode.getAttribute('data-fuxa-icon-id') || '',
        alarmIconId: alarmNode.getAttribute('data-fuxa-icon-id') || '',
        alarmShapeId: alarmItemId,
        invertIconState: !normalVisibleAtZero && alarmVisibleAtZero,
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
    consumed.add(labelId)
  }

  records.sort((left, right) => left.seq - right.seq)
  return { records, consumed }
}
