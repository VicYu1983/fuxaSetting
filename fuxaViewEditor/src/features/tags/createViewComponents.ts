import type { FuxaConfig } from '../../domain/config/types'
import type { ExportViewModel } from '../../domain/config/prepareFuxaConfigExport'
import { isRecord } from '../../domain/config/validateFuxaConfig'
import { generateId, type RandomValuesProvider } from '../../domain/ids'
import { parseSvg } from '../../domain/svg/parseSvg'
import type { SvgParserConstructor } from '../../domain/svg/parseSvg'
import type { IndexedTag } from '../../domain/tags/index'
import { buildTagIndex } from '../../domain/tags/index'

function collectUsedIds(
  config: FuxaConfig,
  models: ReadonlyMap<string, ExportViewModel>,
  Parser: SvgParserConstructor,
): Set<string> {
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
      throw new Error(`無法安全加入 Tag 元件：View「${name}」的 SVG ID 無法檢查（${detail}）`, {
        cause: error,
      })
    }
  }

  for (const model of models.values()) {
    for (const component of model.components) {
      if (component.shapeId) usedIds.add(component.shapeId)
      if (component.labelId) usedIds.add(component.labelId)
      if (component.alarmShapeId) usedIds.add(component.alarmShapeId)
      for (const id of component.shapeInnerIds ?? []) {
        if (id) usedIds.add(id)
      }
    }
  }
  return usedIds
}

export interface CreateViewComponentsRuntime {
  Parser: SvgParserConstructor
  crypto: RandomValuesProvider
}

export function createViewComponents(
  config: FuxaConfig,
  model: ExportViewModel,
  models: ReadonlyMap<string, ExportViewModel>,
  tags: readonly IndexedTag[],
  runtime: CreateViewComponentsRuntime,
): ExportViewModel {
  const usedIds = collectUsedIds(config, models, runtime.Parser)
  let sequence = model.components.reduce(
    (maximum, component) => Math.max(maximum, Number(component.seq) || 0),
    0,
  )
  const components = tags.map((tag): ExportViewModel['components'][number] => {
    sequence += 1
    return {
      key: `new-${generateId('component', usedIds, runtime.crypto)}`,
      seq: sequence,
      tagId: tag.id,
      label: tag.name,
      template: 'rect',
      palette: 'normal',
      shapeId: generateId('SHE', usedIds, runtime.crypto),
      labelId: generateId('svg', usedIds, runtime.crypto),
      shapeInnerIds: [generateId('SHE', usedIds, runtime.crypto)],
      managed: true,
    }
  })
  return { ...model, components: [...model.components, ...components] }
}
