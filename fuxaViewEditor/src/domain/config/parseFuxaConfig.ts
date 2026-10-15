import { detectSourceTextFormat } from './serialization'
import type { FuxaViewSummary, ParsedFuxaConfig } from './types'
import { isRecord, validateFuxaConfig } from './validateFuxaConfig'

export function parseFuxaConfig(text: string): ParsedFuxaConfig {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : '無法解析 JSON'
    throw new Error(`JSON 格式錯誤：${detail}`, { cause: error })
  }

  const rawConfig = validateFuxaConfig(value)
  const views = rawConfig.hmi.views.map((view, index): FuxaViewSummary => {
    const record = isRecord(view) ? view : {}
    const profile = isRecord(record.profile) ? record.profile : {}
    const items = isRecord(record.items) ? record.items : undefined
    const id = typeof record.id === 'string' ? record.id : ''
    const name = typeof record.name === 'string' && record.name.trim()
      ? record.name
      : `未命名 View ${index + 1}`

    return {
      key: `${id || 'view'}-${index}`,
      id,
      name,
      ...(typeof profile.width === 'number' ? { width: profile.width } : {}),
      ...(typeof profile.height === 'number' ? { height: profile.height } : {}),
      ...(items ? { itemCount: Object.keys(items).length } : {}),
    }
  })

  return {
    originalText: text,
    rawConfig,
    devices: rawConfig.devices,
    views,
    sourceFormat: detectSourceTextFormat(text),
  }
}
