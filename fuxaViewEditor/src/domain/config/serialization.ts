import type { FuxaConfig, SourceTextFormat } from './types'

export function detectSourceTextFormat(text: string): SourceTextFormat {
  return {
    lineEnding: text.includes('\r\n') ? '\r\n' : '\n',
    hasTrailingNewline: /(?:\r\n|\n)$/.test(text),
  }
}

export function serializeFuxaConfig(
  config: FuxaConfig,
  format: SourceTextFormat,
): string {
  let text = JSON.stringify(config, null, 4)
  if (format.lineEnding === '\r\n') text = text.replace(/\n/g, '\r\n')
  if (format.hasTrailingNewline) text += format.lineEnding
  return text
}

export function generatedFileName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf('.')
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  return `${baseName}.generated.json`
}
