import type { FuxaConfig } from '../../domain/config/types'
import { createFuxaConfigExportDependencies } from '../../domain/config/fuxaConfigExportDependencies'
import type { ExportViewModel } from '../../domain/config/prepareFuxaConfigExport'
import { getFloorGroupFrameSettings } from '../../domain/layout/floorGroupFrame'
import { getCanvasWidth, layoutFloorComponents } from '../../domain/layout/floorLayout'
import type { RandomValuesProvider } from '../../domain/ids'
import { parseSvg } from '../../domain/svg/parseSvg'
import type { SvgParserConstructor } from '../../domain/svg/parseSvg'
import { sanitizePreview } from '../../domain/svg/sanitizePreview'
import { findSvgLayer } from '../../domain/svg/findSvgLayer'
import { buildTagIndex } from '../../domain/tags/index'
import { isRecord } from '../../domain/config/validateFuxaConfig'
import { drawPreviewSwitchArtwork } from './drawPreviewSwitchArtwork'

export interface ViewPreview {
  width: number
  height: number
  svgMarkup: string
  outsideCanvas: boolean
}

export interface ViewPreviewRuntime {
  Parser: SvgParserConstructor
  serialize: (doc: XMLDocument) => string
  crypto: RandomValuesProvider
}

function dimension(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

export function layoutExceedsCanvas(
  layout: ReturnType<typeof layoutFloorComponents>,
  width: number,
  height: number,
): boolean {
  return layout.placements.some(({ placement }) => {
    const { shape } = placement
    return shape.x < 0 || shape.y < 0
      || shape.x + shape.width > width
      || shape.y + shape.height > height
  }) || layout.sections.some((section) => (
    section.titleY < 0
    || section.titleY > height
    || section.x > width
    || section.frame.x < 0
    || section.frame.y < 0
    || section.frame.x + section.frame.width > width
    || section.frame.y + section.frame.height > height
  ))
}

export function prepareViewPreview(
  config: FuxaConfig,
  viewId: string,
  models: readonly ExportViewModel[],
  runtime: ViewPreviewRuntime,
): ViewPreview {
  const matches = config.hmi.views.filter(
    (view): view is Record<string, unknown> => isRecord(view) && view.id === viewId,
  )
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `找不到 View「${viewId}」。`
      : `View ID「${viewId}」重複，無法建立預覽。`)
  }

  const view = structuredClone(matches[0]!)
  const previewModels = structuredClone([...models])
  const model = previewModels.find((item) => item.viewId === viewId)
  let previewLayout: ReturnType<typeof layoutFloorComponents> | undefined
  let outsideCanvas = false
  if (model) {
    const tags = buildTagIndex(config)
    const frame = getFloorGroupFrameSettings(config)
    const profile = isRecord(view.profile) ? view.profile : {}
    const width = dimension(profile.width, 1024)
    const height = dimension(profile.height, 768)
    const layout = layoutFloorComponents(
      model.components,
      model.grid,
      tags,
      frame,
      getCanvasWidth(profile),
    )
    previewLayout = layout
    outsideCanvas = layoutExceedsCanvas(
      layout,
      width,
      height,
    )

    const dependencies = createFuxaConfigExportDependencies(config, runtime)
    if (!dependencies.applyView) throw new Error('尚未設定 View 套用函式。')
    dependencies.applyView(view, model, previewModels)
  }

  if (typeof view.svgcontent !== 'string') {
    throw new Error('View 缺少有效的 SVG 內容。')
  }
  const doc = parseSvg(view.svgcontent, runtime.Parser)
  if (previewLayout) {
    const layer = findSvgLayer(doc)
    if (!layer) throw new Error(`View「${view.name || view.id}」找不到可顯示 Switch 預覽的 SVG 圖層。`)
    drawPreviewSwitchArtwork(layer, previewLayout.placements)
  }
  for (const node of Array.from(doc.getElementsByTagName('*'))) {
    if (node.getAttribute('data-fuxa-icon-set-id')
        && node.getAttribute('data-fuxa-state-key') !== 'normal') {
      node.setAttribute('visibility', 'hidden')
    }
  }
  sanitizePreview(doc)

  const profile = isRecord(view.profile) ? view.profile : {}
  const width = dimension(profile.width, 1024)
  const height = dimension(profile.height, 768)
  const root = doc.documentElement
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))

  const background = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
  background.setAttribute('x', '0')
  background.setAttribute('y', '0')
  background.setAttribute('width', String(width))
  background.setAttribute('height', String(height))
  const backgroundColor = typeof profile.bkcolor === 'string'
      && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(profile.bkcolor)
    ? profile.bkcolor
    : '#ffffffff'
  background.setAttribute('fill', backgroundColor)
  root.insertBefore(background, root.firstChild)

  return {
    width,
    height,
    svgMarkup: runtime.serialize(doc),
    outsideCanvas,
  }
}
