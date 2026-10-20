import type { GridSettings } from '../config/types'
import type { IconAsset } from '../icons/iconLibrary'
import type { ComponentPlacement } from '../layout/gridLayout'
import type { ManagedComponentRecord } from './readManagedComponents'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'
const PALETTES = {
  normal: ['#00ff07ff', '#f80000ff'],
  alarm: ['#ff0000ff', '#00ff07ff'],
} as const

export type SvgComponent = ManagedComponentRecord & {
  template: 'icon-multi' | 'icon-pair' | 'icon' | 'cylinder' | 'switch' | 'rect'
  shapeInnerIds: Array<string | null>
  normalIconId?: string
  alarmIconId?: string
  alarmShapeId?: string
  invertIconState?: boolean
}

export type IconAssetResolver = (iconId: string | undefined) => IconAsset | undefined
export type SvgIdAllocator = (prefix: string) => string

export interface BuiltComponentNodes {
  shapeNodes: Element[]
  labelNode: Element
}

function createSvgNode(
  doc: XMLDocument,
  name: string,
  attributes: Record<string, string | number>,
): Element {
  const node = doc.createElementNS(SVG_NAMESPACE, name)
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value))
  }
  return node
}

function appendChild(parent: Element, child: Element): void {
  parent.appendChild(child)
}

function setIconHref(node: Element, icon: IconAsset): void {
  node.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', icon.dataUrl)
}

function requireIcon(
  resolveIcon: IconAssetResolver,
  iconId: string | undefined,
  component: SvgComponent,
  message: string,
): IconAsset {
  const icon = resolveIcon(iconId)
  if (!icon) throw new Error(`元件「${component.label || '未命名'}」${message}`)
  return icon
}

function allocateInnerIds(
  component: SvgComponent,
  count: number,
  allocateId: SvgIdAllocator,
): string[] {
  while (component.shapeInnerIds.length < count) {
    component.shapeInnerIds.push(allocateId('SHE'))
  }
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const currentId = component.shapeInnerIds[index]
    if (currentId) {
      ids.push(currentId)
      continue
    }
    const allocatedId = allocateId('SHE')
    component.shapeInnerIds[index] = allocatedId
    ids.push(allocatedId)
  }
  return ids
}

function buildIconPairNodes(
  doc: XMLDocument,
  component: SvgComponent,
  placement: ComponentPlacement,
  resolveIcon: IconAssetResolver,
): Element[] {
  const normalIcon = requireIcon(
    resolveIcon,
    component.normalIconId,
    component,
    '尚未設定正常與告警圖示。',
  )
  const alarmIcon = requireIcon(
    resolveIcon,
    component.alarmIconId,
    component,
    '尚未設定正常與告警圖示。',
  )
  if (!component.alarmShapeId) {
    throw new Error(`元件「${component.label || '未命名'}」尚未設定正常與告警圖示。`)
  }
  const { x, y } = placement.shape
  return [
    { icon: normalIcon, name: `tc_${component.seq}`, id: component.shapeId },
    { icon: alarmIcon, name: `tc_${component.seq}_alarm`, id: component.alarmShapeId },
  ].map(({ icon, name, id }) => {
    const image = createSvgNode(doc, 'image', {
      'data-name': name,
      'data-fuxa-icon-id': icon.id,
      id,
      x,
      y,
      width: placement.shape.width,
      height: placement.shape.height,
      preserveAspectRatio: 'xMidYMid meet',
    })
    setIconHref(image, icon)
    return image
  })
}

function buildMultiStateNodes(
  doc: XMLDocument,
  component: SvgComponent,
  placement: ComponentPlacement,
  resolveIcon: IconAssetResolver,
): Element[] {
  const normalIcon = requireIcon(
    resolveIcon,
    component.normalIconId,
    component,
    '尚未設定多狀態圖示組的正常圖示。',
  )
  const iconSetId = component.multiIconSetId
  const bindings = component.multiStateBindings
  if (!iconSetId || !bindings?.length) {
    throw new Error(`元件「${component.label || '未命名'}」尚未設定多狀態圖示組或狀態。`)
  }
  const { x, y } = placement.shape
  const createImage = (
    icon: IconAsset,
    id: string,
    name: string,
    stateKey: string,
    priority?: number,
  ): Element => {
    const image = createSvgNode(doc, 'image', {
      'data-name': name,
      'data-fuxa-icon-id': icon.id,
      'data-fuxa-icon-set-id': iconSetId,
      'data-fuxa-state-key': stateKey,
      ...(priority === undefined ? {} : { 'data-fuxa-state-priority': priority }),
      id,
      x,
      y,
      width: placement.shape.width,
      height: placement.shape.height,
      preserveAspectRatio: 'xMidYMid meet',
    })
    setIconHref(image, icon)
    return image
  }
  const nodes = [
    createImage(normalIcon, component.shapeId, `tc_${component.seq}`, 'normal'),
  ]
  for (const binding of bindings) {
    if (!binding.tagId) {
      throw new Error(`元件「${component.label || '未命名'}」的狀態「${binding.stateKey}」尚未綁定 Boolean Tag。`)
    }
    if (!binding.shapeId) {
      throw new Error(`元件「${component.label || '未命名'}」的狀態「${binding.stateKey}」缺少圖示 ID。`)
    }
  }
  for (const { binding, priority } of bindings
    .map((binding, priority) => ({ binding, priority }))
    .reverse()) {
    const icon = requireIcon(
      resolveIcon,
      binding.iconId,
      component,
      `的狀態「${binding.stateKey}」圖示不存在。`,
    )
    nodes.push(createImage(
      icon,
      binding.shapeId,
      `tc_${component.seq}_state_${binding.stateKey}`,
      binding.stateKey,
      priority,
    ))
  }
  return nodes
}

function buildShapeNode(
  doc: XMLDocument,
  component: SvgComponent,
  placement: ComponentPlacement,
  resolveIcon: IconAssetResolver,
  allocateId: SvgIdAllocator,
): Element {
  const icon = component.template === 'icon'
    ? requireIcon(resolveIcon, component.iconId, component, '使用的圖示不存在。')
    : undefined
  const type = component.template === 'cylinder'
    ? 'svg-ext-shapes-cylinder'
    : 'svg-ext-shapes-rectangle'
  const group = createSvgNode(doc, 'g', {
    'data-name': `tc_${component.seq}`,
    id: component.shapeId,
    type,
    fill: icon ? PALETTES[component.palette][0] : '#FFFFFF',
    stroke: '#000000',
    'font-size': '14',
    'font-family': 'sans-serif',
    'text-anchor': 'middle',
  })
  const { x, y } = placement.shape

  if (component.template === 'cylinder') {
    const width = placement.shape.width
    const height = placement.shape.height
    const ry = Math.min(10, height / 6)
    const [bodyId, topId] = allocateInnerIds(component, 2, allocateId)
    const top = y + ry
    const bottom = y + height - ry
    appendChild(group, createSvgNode(doc, 'path', {
      id: bodyId ?? '',
      d: `M ${x} ${top} C ${x} ${y} ${x + width} ${y} ${x + width} ${top} L ${x + width} ${bottom} C ${x + width} ${y + height} ${x} ${y + height} ${x} ${bottom} Z`,
    }))
    appendChild(group, createSvgNode(doc, 'path', {
      id: topId ?? '',
      d: `M ${x} ${top} C ${x} ${top + ry * 2} ${x + width} ${top + ry * 2} ${x + width} ${top}`,
    }))
  } else if (icon) {
    const [iconNodeId, markerId] = allocateInnerIds(component, 2, allocateId)
    const image = createSvgNode(doc, 'image', {
      'data-fuxa-icon-id': icon.id,
      id: iconNodeId ?? '',
      x,
      y,
      width: placement.shape.width,
      height: placement.shape.height,
      preserveAspectRatio: 'xMidYMid meet',
    })
    setIconHref(image, icon)
    appendChild(group, image)
    const markerSize = 8
    appendChild(group, createSvgNode(doc, 'rect', {
      'data-fuxa-state-marker': 'true',
      id: markerId ?? '',
      x: x + placement.shape.width - markerSize,
      y: y + placement.shape.height - markerSize,
      width: markerSize,
      height: markerSize,
      stroke: 'none',
    }))
  } else {
    const [rectId] = allocateInnerIds(component, 1, allocateId)
    appendChild(group, createSvgNode(doc, 'rect', {
      id: rectId ?? '',
      x,
      y,
      width: placement.shape.width,
      height: placement.shape.height,
    }))
  }
  return group
}

function withSwitchPrefix(id: string | undefined, prefix: string): string {
  const current = id ?? ''
  return current.startsWith(prefix) ? current : `${prefix}${current.replace(/^[A-Za-z]+_/, '')}`
}

function buildSwitchNode(
  doc: XMLDocument,
  component: SvgComponent,
  placement: ComponentPlacement,
  allocateId: SvgIdAllocator,
): Element {
  const [hitboxId, rawForeignObjectId, rawHtmlLabelId] = allocateInnerIds(component, 3, allocateId)
  // FUXA 以 id 前綴 "T-HXT_" 尋找並掛載 ngx-switch，前綴不符則開關不會被初始化而無法點擊
  const foreignObjectId = withSwitchPrefix(rawForeignObjectId, 'H-HXT_')
  const htmlLabelId = withSwitchPrefix(rawHtmlLabelId, 'T-HXT_')
  component.shapeInnerIds[1] = foreignObjectId
  component.shapeInnerIds[2] = htmlLabelId
  const { x, y } = placement.shape
  const group = createSvgNode(doc, 'g', {
    'data-name': `tc_${component.seq}`,
    id: component.shapeId,
    type: 'svg-ext-html_switch',
    fill: 'rgba(0,0,0,0)',
    stroke: 'rgba(0,0,0,0)',
  })
  appendChild(group, createSvgNode(doc, 'rect', {
    id: hitboxId ?? '',
    x,
    y,
    width: placement.shape.width,
    height: placement.shape.height,
    'stroke-width': 0,
  }))
  const foreignObject = createSvgNode(doc, 'foreignObject', {
    id: foreignObjectId ?? '',
    x,
    y,
    width: placement.shape.width,
    height: placement.shape.height,
  })
  const label = createSvgNode(doc, 'LABEL', {
    id: htmlLabelId ?? '',
    class: 'md-switch',
    style: 'width:calc(100% - 6px);height:calc(100% - 6px);text-align:center;background-color:#FFFFFF;color:#000000;margin: 3px 3px 3px 3px;',
  })
  const ngxSwitch = createSvgNode(doc, 'NGX-SWITCH', { class: 'ng-star-inserted' })
  const switchLabel = createSvgNode(doc, 'LABEL', {
    class: 'md-switch',
    style: 'border-radius: 0px;',
  })
  const toggle = createSvgNode(doc, 'DIV', {
    class: 'toggle-button',
    style: 'background-color: rgb(204, 204, 204); opacity: 1; pointer-events: auto;',
  })
  const input = createSvgNode(doc, 'INPUT', { type: 'checkbox' })
  const slider = createSvgNode(doc, 'DIV', {
    class: 'inner-circle',
    style: 'text-align: center; line-height: 22px; font-size: 12px; background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);',
  })
  appendChild(toggle, input)
  appendChild(toggle, slider)
  appendChild(switchLabel, toggle)
  appendChild(ngxSwitch, switchLabel)
  appendChild(label, ngxSwitch)
  appendChild(foreignObject, label)
  appendChild(group, foreignObject)
  return group
}

function buildLabelNode(
  doc: XMLDocument,
  component: SvgComponent,
  placement: ComponentPlacement,
  grid: GridSettings,
): Element {
  const text = createSvgNode(doc, 'text', {
    'data-name': `tc_${component.seq}_label`,
    id: component.labelId,
    x: placement.label.x,
    y: placement.label.y,
    fill: '#000000',
    stroke: '#000000',
    'stroke-width': '0',
    'font-size': grid.labelFontSize,
    'font-family': 'sans-serif',
    'text-anchor': placement.label.anchor,
    'xml:space': 'preserve',
  })
  text.textContent = component.label
  return text
}

export function buildComponentNodes(
  doc: XMLDocument,
  component: SvgComponent,
  placement: ComponentPlacement,
  grid: GridSettings,
  resolveIcon: IconAssetResolver,
  allocateId: SvgIdAllocator,
): BuiltComponentNodes {
  const shapeNodes = component.template === 'icon-pair'
    ? buildIconPairNodes(doc, component, placement, resolveIcon)
    : component.template === 'icon-multi'
      ? buildMultiStateNodes(doc, component, placement, resolveIcon)
      : [component.template === 'switch'
        ? buildSwitchNode(doc, component, placement, allocateId)
        : buildShapeNode(doc, component, placement, resolveIcon, allocateId)]
  return {
    shapeNodes,
    labelNode: buildLabelNode(doc, component, placement, grid),
  }
}
