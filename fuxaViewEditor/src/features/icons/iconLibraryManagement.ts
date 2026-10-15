import type { FuxaConfig } from '../../domain/config/types'
import { isRecord } from '../../domain/config/validateFuxaConfig'
import {
  getIconLibrary,
  saveIconLibrary,
} from '../../domain/icons/iconLibrary'
import type { IconLibraryEntry, IconMimeType } from '../../domain/icons/iconLibrary'
import type { ExportViewModel } from '../../domain/config/prepareFuxaConfigExport'
import { generateId, type RandomValuesProvider } from '../../domain/ids'
import { parseSvg, type SvgParserConstructor } from '../../domain/svg/parseSvg'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function identifyIconMimeType(bytes: Uint8Array): IconMimeType | null {
  if (bytes.length >= 8
      && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        .every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(...bytes.subarray(0, 6)))) {
    return 'image/gif'
  }
  return null
}

function createAsset(
  bytes: Uint8Array,
  id: string,
): { id: string; mimeType: IconMimeType; dataUrl: string } {
  const mimeType = identifyIconMimeType(bytes)
  if (!mimeType) throw new Error('圖片格式無效；請選擇 PNG、JPEG 或 GIF。')
  return { id, mimeType, dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}` }
}

function nextIconId(
  ids: Set<string>,
  cryptoProvider: RandomValuesProvider,
): string {
  return generateId('icon', ids, cryptoProvider)
}

export function addIconLibraryEntry(
  source: FuxaConfig,
  nameInput: string,
  type: 'single' | 'pair',
  images: readonly Uint8Array[],
  cryptoProvider: RandomValuesProvider,
): FuxaConfig {
  const name = nameInput.trim()
  if (!name) throw new Error('圖示名稱不可空白。')
  const icons = getIconLibrary(source)
  if (icons.some((icon) => icon.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error(`圖示名稱「${name}」已存在，請輸入不同名稱。`)
  }
  if (images.length !== (type === 'pair' ? 2 : 1)) {
    throw new Error(type === 'pair' ? '請選擇正常與告警兩張圖片。' : '請選擇一張圖片。')
  }

  const ids = new Set<string>()
  for (const icon of icons) {
    ids.add(icon.id)
    if (icon.type === 'pair') {
      ids.add(icon.normal.id)
      ids.add(icon.alarm.id)
    }
  }
  let id = ''
  const relatedIds = (candidate: string) => type === 'pair'
    ? [`icon-set-${candidate}`, `${candidate}-normal`, `${candidate}-alarm`]
    : [`icon-${candidate}`]
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = nextIconId(ids, cryptoProvider)
    const derivedIds = relatedIds(candidate)
    if (derivedIds.every((candidateId) => !ids.has(candidateId))) {
      id = candidate
      derivedIds.forEach((candidateId) => ids.add(candidateId))
      break
    }
  }
  if (!id) throw new Error('無法產生唯一圖示 ID。')
  const created: IconLibraryEntry = type === 'pair'
    ? {
      id: `icon-set-${id}`,
      name,
      type,
      normal: createAsset(images[0]!, `${id}-normal`),
      alarm: createAsset(images[1]!, `${id}-alarm`),
    }
    : {
      ...createAsset(images[0]!, `icon-${id}`),
      name,
      type,
    }
  const nextConfig = structuredClone(source)
  saveIconLibrary(nextConfig, [...icons, created])
  return nextConfig
}

export function findIconLibraryUsages(
  icons: readonly IconLibraryEntry[],
  models: ReadonlyMap<string, ExportViewModel>,
  viewNames: ReadonlyMap<string, string>,
  tagNames: ReadonlyMap<string, string>,
  iconId: string,
): string[] {
  const icon = icons.find((candidate) => candidate.id === iconId)
  if (!icon) return []
  const assetIds = new Set([icon.id])
  if (icon.type === 'pair') {
    assetIds.add(icon.normal.id)
    assetIds.add(icon.alarm.id)
  }
  const usages: string[] = []
  for (const [viewId, model] of models) {
    for (const component of model.components) {
      if (component.managed === false
          || ![component.iconId, component.normalIconId, component.alarmIconId]
            .some((assetId) => assetId && assetIds.has(assetId))) continue
      const label = component.label || tagNames.get(component.tagId) || `#${component.seq}`
      usages.push(`「${viewNames.get(viewId) || viewId}」的 ${label}`)
    }
  }
  return usages
}

export function findIconLibrarySvgUsages(
  icons: readonly IconLibraryEntry[],
  config: FuxaConfig,
  iconId: string,
  Parser: SvgParserConstructor,
): string[] {
  const icon = icons.find((candidate) => candidate.id === iconId)
  if (!icon) return []
  const assetIds = new Set([icon.id])
  if (icon.type === 'pair') {
    assetIds.add(icon.normal.id)
    assetIds.add(icon.alarm.id)
  }
  const views = Array.isArray(config.hmi.views) ? config.hmi.views : []
  const usages: string[] = []
  for (const view of views) {
    if (!isRecord(view) || typeof view.svgcontent !== 'string') continue
    let doc: XMLDocument
    try {
      doc = parseSvg(view.svgcontent, Parser)
    } catch (error) {
      const label = typeof view.name === 'string' ? view.name : String(view.id || '未知 View')
      throw new Error(`無法掃描 View「${label}」的 SVG，為避免破壞圖示引用，已取消刪除。`, {
        cause: error,
      })
    }
    const usesIcon = Array.from(doc.getElementsByTagName('*')).some((element) => {
      const assetId = element.getAttribute('data-fuxa-icon-id')
      return assetId !== null && assetIds.has(assetId)
    })
    if (usesIcon) {
      usages.push(`「${typeof view.name === 'string' ? view.name : String(view.id || '未知 View')}」的 SVG 元件`)
    }
  }
  return usages
}

export function removeIconLibraryEntry(
  source: FuxaConfig,
  iconId: string,
  usages: readonly string[],
): FuxaConfig {
  if (usages.length) {
    throw new Error(`此圖示仍被使用，無法刪除：${usages.join('、')}`)
  }
  const icons = getIconLibrary(source)
  if (!icons.some((icon) => icon.id === iconId)) throw new Error('找不到要刪除的圖示。')
  const nextConfig = structuredClone(source)
  saveIconLibrary(nextConfig, icons.filter((icon) => icon.id !== iconId))
  return nextConfig
}
