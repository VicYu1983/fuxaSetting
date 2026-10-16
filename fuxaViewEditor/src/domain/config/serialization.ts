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

export function projectFileName(projectName: string): string {
  const name = projectName.trim().replace(/\.json$/i, '')
  if (!name) throw new Error('專案名稱不可空白。')
  const hasControlCharacter = [...name].some((character) => (
    character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  ))
  if (/[<>:"/\\|?*]/.test(name) || hasControlCharacter || /[. ]$/.test(name)) {
    throw new Error('專案名稱不可包含檔名不支援的字元，且不可用句點或空白結尾。')
  }
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) {
    throw new Error('此專案名稱為 Windows 保留名稱，請使用其他名稱。')
  }
  return `${name}.json`
}
