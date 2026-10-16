import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFuxaConfig } from '../../src/domain/config/parseFuxaConfig'
import { createEmptyFuxaConfig } from '../../src/domain/config/createEmptyFuxaConfig'
import {
  generatedFileName,
  serializeFuxaConfig,
} from '../../src/domain/config/serialization'

describe('parseFuxaConfig', () => {
  it('creates an independent empty project matching the shared FUXA template', () => {
    const template = JSON.parse(
      readFileSync(resolve(process.cwd(), '..', 'fuxa-project.json'), 'utf8'),
    )
    const config = createEmptyFuxaConfig()

    expect(config).toEqual(template)
    expect(parseFuxaConfig(JSON.stringify(config)).views).toHaveLength(1)
    config.hmi.views[0] = {}
    expect(createEmptyFuxaConfig()).toEqual(template)
  })

  it('summarizes FUXA views while retaining the original configuration', () => {
    const raw = {
      devices: {
        deviceA: { tags: { tagA: {}, tagB: {} } },
        deviceB: { tags: { tagC: {} } },
      },
      hmi: {
        views: [{
          id: 'view-a',
          name: 'Overview',
          profile: { width: 1024, height: 768 },
          items: { itemA: {}, itemB: {} },
        }],
      },
      untouched: { value: true },
    }

    const result = parseFuxaConfig(JSON.stringify(raw))

    expect(result.views).toEqual([{
      key: 'view-a-0',
      id: 'view-a',
      name: 'Overview',
      width: 1024,
      height: 768,
      itemCount: 2,
    }])
    expect(result.devices).toEqual(raw.devices)
    expect(result.rawConfig.untouched).toEqual({ value: true })
  })

  it('creates unique keys for views even when identifiers are missing or repeated', () => {
    const result = parseFuxaConfig(JSON.stringify({
      devices: {},
      hmi: {
        views: [
          { id: 'duplicate', name: 'First' },
          { id: 'duplicate', name: 'Second' },
          {},
        ],
      },
    }))

    expect(result.views.map((view) => view.key)).toEqual([
      'duplicate-0',
      'duplicate-1',
      'view-2',
    ])
    expect(result.views.at(2)?.name).toBe('未命名 View 3')
  })

  it('reports malformed JSON and non-FUXA shapes explicitly', () => {
    expect(() => parseFuxaConfig('{')).toThrow('JSON 格式錯誤')
    expect(() => parseFuxaConfig(JSON.stringify({}))).toThrow(
      '需包含 devices 與 hmi.views',
    )
  })
})

describe('FUXA config serialization', () => {
  it('preserves line endings and trailing-newline policy', () => {
    const config = { devices: {}, hmi: { views: [] } }
    const json = JSON.stringify(config, null, 4)

    expect(serializeFuxaConfig(config, {
      lineEnding: '\n',
      hasTrailingNewline: false,
    })).toBe(json)
    expect(serializeFuxaConfig(config, {
      lineEnding: '\r\n',
      hasTrailingNewline: true,
    })).toBe(`${json.replace(/\n/g, '\r\n')}\r\n`)
  })

  it('retains the exact source text for an unchanged FUXA configuration', () => {
    const originalText = readFileSync(resolve(process.cwd(), '..', '旭峰建設.json'), 'utf8')
    const parsed = parseFuxaConfig(originalText)

    expect(parsed.originalText).toBe(originalText)
    expect(parsed.sourceFormat).toEqual({
      lineEnding: originalText.includes('\r\n') ? '\r\n' : '\n',
      hasTrailingNewline: /(?:\r\n|\n)$/.test(originalText),
    })
  })

  it('creates the established generated filename', () => {
    expect(generatedFileName('旭峰建設.json')).toBe('旭峰建設.generated.json')
    expect(generatedFileName('旭峰建設')).toBe('旭峰建設.generated.json')
  })
})
