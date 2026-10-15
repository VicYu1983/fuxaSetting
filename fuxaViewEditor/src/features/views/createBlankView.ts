import type { FuxaConfig } from '../../domain/config/types'
import { generateId } from '../../domain/ids'
import { parseSvg } from '../../domain/svg/parseSvg'
import type { RandomValuesProvider } from '../../domain/ids'
import type { SvgParserConstructor } from '../../domain/svg/parseSvg'
import { buildTagIndex } from '../../domain/tags/index'
import { isRecord } from '../../domain/config/validateFuxaConfig'

export interface CreateBlankViewRuntime {
  Parser: SvgParserConstructor
  serialize: (doc: XMLDocument) => string
  crypto: RandomValuesProvider
}

function collectUsedIds(config: FuxaConfig, Parser: SvgParserConstructor): Set<string> {
  const usedIds = new Set(buildTagIndex(config).keys())
  for (const view of config.hmi.views) {
    if (!isRecord(view)) continue
    if (typeof view.id === 'string') usedIds.add(view.id)
    if (isRecord(view.items)) {
      for (const id of Object.keys(view.items)) usedIds.add(id)
    }
    if (typeof view.svgcontent !== 'string') continue

    try {
      const doc = parseSvg(view.svgcontent, Parser)
      for (const element of Array.from(doc.getElementsByTagName('*'))) {
        const id = element.getAttribute('id')
        if (id) usedIds.add(id)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const name = typeof view.name === 'string' && view.name ? view.name : view.id
      throw new Error(`無法安全新增 View：View「${name}」的 SVG ID 無法檢查（${detail}）`, {
        cause: error,
      })
    }
  }
  return usedIds
}

export function createBlankView(
  config: FuxaConfig,
  name: string,
  selectedViewId: string,
  runtime: CreateBlankViewRuntime,
): { view: Record<string, unknown>; titleId: string } {
  const usedIds = collectUsedIds(config, runtime.Parser)
  const id = generateId('v', usedIds, runtime.crypto)
  const titleId = generateId('svg', usedIds, runtime.crypto)

  const defaultProfile: Record<string, unknown> = {
    width: 1024,
    height: 768,
    bkcolor: '#ffffffff',
    margin: 10,
    align: 'topCenter',
    gridType: 'fixed',
    viewRenderDelay: 0,
  }
  const activeView = config.hmi.views.find(
    (view) => isRecord(view) && view.id === selectedViewId,
  )
  const activeProfile = isRecord(activeView) && isRecord(activeView.profile)
    ? activeView.profile
    : undefined
  if (activeProfile) {
    if (typeof activeProfile.width === 'number' && activeProfile.width > 0) {
      defaultProfile.width = activeProfile.width
    }
    if (typeof activeProfile.height === 'number' && activeProfile.height > 0) {
      defaultProfile.height = activeProfile.height
    }
    if (typeof activeProfile.bkcolor === 'string') {
      defaultProfile.bkcolor = activeProfile.bkcolor
    }
  }

  const width = typeof defaultProfile.width === 'number' ? defaultProfile.width : 1024
  const height = typeof defaultProfile.height === 'number' ? defaultProfile.height : 768
  const escapedName = name.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]!)
  const doc = parseSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g><title>Layer 1</title><text data-name="view_title" id="${titleId}" x="20" y="36" fill="#000000" stroke="#000000" stroke-width="0" font-size="24" font-family="sans-serif" text-anchor="start" xml:space="preserve">${escapedName}</text></g></svg>`,
    runtime.Parser,
  )
  const view: Record<string, unknown> = {
    id,
    name,
    profile: defaultProfile,
    items: {
      [titleId]: {
        id: titleId,
        type: 'svg-ext-shapes-text',
        name: 'view_title',
        property: null,
        label: 'Shapes',
        hide: false,
        lock: false,
      },
    },
    variables: {},
    svgcontent: runtime.serialize(doc),
    type: 'svg',
  }
  return { view, titleId }
}
