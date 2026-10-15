export interface FuxaViewSummary {
  key: string
  id: string
  name: string
  width?: number
  height?: number
  itemCount?: number
}

export interface FuxaConfigSummary {
  rawConfig: Record<string, unknown>
  devices: Record<string, unknown>
  views: FuxaViewSummary[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseFuxaConfig(text: string): FuxaConfigSummary {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : '無法解析 JSON'
    throw new Error(`JSON 格式錯誤：${detail}`, { cause: error })
  }

  if (!isRecord(value) || !isRecord(value.devices) || !isRecord(value.hmi)
    || !Array.isArray(value.hmi.views)) {
    throw new Error('檔案不是可辨識的 FUXA 配置（需包含 devices 與 hmi.views）。')
  }

  const views = value.hmi.views.map((view, index): FuxaViewSummary => {
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

  return { rawConfig: value, devices: value.devices, views }
}
