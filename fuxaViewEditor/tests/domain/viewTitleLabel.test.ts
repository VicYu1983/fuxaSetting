import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import { prepareFuxaConfigExport } from '../../src/domain/config/prepareFuxaConfigExport'
import type { SvgParser } from '../../src/domain/svg/parseSvg'
import {
  DEFAULT_VIEW_TITLE_LABEL,
  getViewTitleLabelSettings,
  normalizeViewTitleLabelSettings,
  updateAllViewTitleLabels,
} from '../../src/domain/views/viewTitleLabel'

class TestElement {
  readonly attributes: Record<string, string>
  readonly children: TestElement[] = []
  parentNode: TestElement | null = null
  textContent = ''
  readonly localName: string

  constructor(localName: string, attributes: Record<string, string> = {}) {
    this.localName = localName
    this.attributes = { ...attributes }
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  appendChild(child: TestElement): void {
    child.parentNode = this
    this.children.push(child)
  }

  getElementsByTagName(name: string): TestElement[] {
    return this.children.flatMap((child) => [
      ...(name === '*' || child.localName === name ? [child] : []),
      ...child.getElementsByTagName(name),
    ])
  }
}

function createSvgDocument(viewId: string, withTitle = true): XMLDocument {
  const root = new TestElement('svg', { 'data-view-id': viewId })
  if (withTitle) {
    root.appendChild(new TestElement('text', {
      id: `${viewId}-title`,
      'data-name': 'view_title',
      fill: '#000000',
      'font-size': '24',
    }))
  }
  return {
    documentElement: root,
    getElementsByTagName(name: string) {
      if (name === 'parsererror') return []
      return [
        ...(name === '*' || root.localName === name ? [root] : []),
        ...root.getElementsByTagName(name),
      ]
    },
  } as unknown as XMLDocument
}

function createRuntime() {
  const documents = new Map([
    ['view-a', createSvgDocument('a')],
    ['view-b', createSvgDocument('b')],
    ['view-empty', createSvgDocument('empty', false)],
  ])
  class Parser implements SvgParser {
    parseFromString(source: string): XMLDocument {
      const viewId = source.replace(/^serialized-/, '')
      const doc = documents.get(viewId)
      if (!doc) throw new Error(`Unknown fixture ${source}`)
      return doc
    }
  }
  return {
    Parser,
    serialize(doc: XMLDocument) {
      const viewId = doc.documentElement.getAttribute('data-view-id')
      if (!viewId) throw new Error('Missing fixture ID')
      return `serialized-view-${viewId}`
    },
    documents,
  }
}

function createConfig(): FuxaConfig {
  return {
    devices: {},
    hmi: {
      views: [
        {
          id: 'a',
          name: 'Main',
          svgcontent: 'view-a',
          items: { 'a-title': { name: 'view_title' } },
        },
        {
          id: 'b',
          name: 'Overview',
          svgcontent: 'view-b',
          items: { 'b-title': { name: 'view_title' } },
        },
        { id: 'empty', name: 'No title', svgcontent: 'view-empty', items: {} },
      ],
    },
    extra: { preserve: true, fuxaSetting: { keep: 'also' } },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

describe('viewTitleLabel', () => {
  it('normalizes global title label settings', () => {
    expect(getViewTitleLabelSettings(createConfig())).toEqual(DEFAULT_VIEW_TITLE_LABEL)
    const runtime = createRuntime()
    expect(getViewTitleLabelSettings(createConfig(), 'a', runtime.Parser))
      .toEqual(DEFAULT_VIEW_TITLE_LABEL)
    expect(normalizeViewTitleLabelSettings({ color: '#ABCDEF', fontSize: 32 })).toEqual({
      color: '#abcdef',
      fontSize: 32,
    })
    expect(normalizeViewTitleLabelSettings({ color: 'red', fontSize: 100 }))
      .toEqual(DEFAULT_VIEW_TITLE_LABEL)
  })

  it('updates every View title and stores the settings in extra', () => {
    const source = createConfig()
    const runtime = createRuntime()
    const result = updateAllViewTitleLabels(
      source,
      { color: '#336699', fontSize: 30 },
      runtime.Parser,
      runtime.serialize,
    )

    expect(result.changed).toBe(true)
    expect(result.config.extra).toEqual({
      preserve: true,
      fuxaSetting: { keep: 'also', viewTitleLabel: { color: '#336699', fontSize: 30 } },
    })
    expect(result.config.hmi.views.map((view) => {
      if (!isRecord(view)) throw new Error('Expected a View object')
      return view.svgcontent
    })).toEqual([
      'serialized-view-a',
      'serialized-view-b',
      'view-empty',
    ])
    for (const viewId of ['a', 'b']) {
      const doc = runtime.documents.get(`view-${viewId}`)
      const title = doc?.getElementsByTagName('text')[0]
      expect(title?.getAttribute('fill')).toBe('#336699')
      expect(title?.getAttribute('font-size')).toBe('30')
    }
    expect(source.extra).toEqual({
      preserve: true,
      fuxaSetting: { keep: 'also' },
    })
    const exported = prepareFuxaConfigExport({
      config: result.config,
      originalText: '',
      sourceFormat: { lineEnding: '\n', hasTrailingNewline: false },
      dirty: true,
      models: [],
      modifiedViewIds: new Set(),
    }, {
      validate: () => {},
    })
    expect((exported.config.extra as Record<string, unknown>).fuxaSetting)
      .toMatchObject({ viewTitleLabel: { color: '#336699', fontSize: 30 } })
  })

  it('returns unchanged when stored settings and all existing title labels match', () => {
    const runtime = createRuntime()
    const config = updateAllViewTitleLabels(
      createConfig(),
      { color: '#336699', fontSize: 30 },
      runtime.Parser,
      runtime.serialize,
    ).config

    const result = updateAllViewTitleLabels(
      config,
      { color: '#336699', fontSize: 30 },
      runtime.Parser,
      runtime.serialize,
    )

    expect(result.changed).toBe(false)
    expect(result.config).toBe(config)
  })
})
