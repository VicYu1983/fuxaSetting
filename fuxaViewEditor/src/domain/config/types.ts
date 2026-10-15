export type LineEnding = '\n' | '\r\n'

export interface SourceTextFormat {
  lineEnding: LineEnding
  hasTrailingNewline: boolean
}

export interface FuxaViewSummary {
  key: string
  id: string
  name: string
  width?: number
  height?: number
  itemCount?: number
}

export type LabelPosition = 'above' | 'below' | 'left' | 'right'

export interface GridSettings {
  columns: number
  originX: number
  originY: number
  gapX: number
  gapY: number
  labelPosition: LabelPosition
  labelOffset: number
  labelFontSize: number
}

export interface FloorGroupFrameSettings {
  fill: string
  fillOpacity: number
  stroke: string
  strokeWidth: number
  cornerRadius: number
  padding: number
}

export interface FuxaConfig {
  devices: Record<string, unknown>
  hmi: Record<string, unknown> & { views: unknown[] }
  [key: string]: unknown
}

export interface TagExtra {
  floor?: string
  [key: string]: unknown
}

export interface FuxaTag {
  id?: string
  name?: string
  type?: string
  extra?: TagExtra
  [key: string]: unknown
}

export interface ParsedFuxaConfig {
  originalText: string
  rawConfig: FuxaConfig
  devices: Record<string, unknown>
  views: FuxaViewSummary[]
  sourceFormat: SourceTextFormat
}
