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

export interface FuxaConfig {
  devices: Record<string, unknown>
  hmi: Record<string, unknown> & { views: unknown[] }
  [key: string]: unknown
}

export interface ParsedFuxaConfig {
  originalText: string
  rawConfig: FuxaConfig
  devices: Record<string, unknown>
  views: FuxaViewSummary[]
  sourceFormat: SourceTextFormat
}
