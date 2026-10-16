import { describe, expect, it } from 'vitest'
import type { ExportViewModel } from '../../../src/domain/config/prepareFuxaConfigExport'
import type { FuxaConfig } from '../../../src/domain/config/types'
import { groupComponentsByFloor } from '../../../src/domain/layout/floorLayout'
import type { SvgParser } from '../../../src/domain/svg/parseSvg'
import { buildTagIndex } from '../../../src/domain/tags/index'
import type { IndexedTag } from '../../../src/domain/tags/index'
import { createViewComponents } from '../../../src/features/tags/createViewComponents'

function fakeParser(source: string): XMLDocument {
  const ids = Array.from(source.matchAll(/\bid="([^"]+)"/g), (match) => match[1]!)
  const elements = ids.map((id) => ({
    getAttribute(name: string) {
      return name === 'id' ? id : null
    },
  }))
  const root = { localName: 'svg', getAttribute: () => null }
  return {
    documentElement: root,
    getElementsByTagName(name: string) {
      return name === 'parsererror' ? [] : name === '*' ? [root, ...elements] : []
    },
  } as unknown as XMLDocument
}

class TestParser implements SvgParser {
  parseFromString(source: string, mimeType: 'image/svg+xml'): XMLDocument {
    if (mimeType !== 'image/svg+xml') throw new Error('Unexpected MIME type')
    return fakeParser(source)
  }
}

function model(components: ExportViewModel['components'] = []): ExportViewModel {
  return {
    viewId: 'view-1',
    components,
    grid: {
      columns: 4,
      originX: 20,
      originY: 20,
      gapX: 20,
      gapY: 20,
      labelPosition: 'above',
      labelOffset: 4,
      labelFontSize: 14,
    },
    floorGroupFrame: {
      fill: '#ffffff',
      fillOpacity: 0.2,
      stroke: '#000000',
      strokeWidth: 1,
      cornerRadius: 4,
      padding: 8,
    },
    floorTitles: {},
    floorTitleIds: {},
    floorFrames: {},
    floorFrameIds: {},
    floorFrameShapeIds: {},
  }
}

const tag: IndexedTag = {
  id: 'tag-1',
  name: 'Pump',
  type: 'Bool',
  deviceId: 'device-1',
  deviceName: 'Device',
  floor: '2F',
  record: { id: 'tag-1', name: 'Pump', type: 'Bool' },
}

describe('createViewComponents', () => {
  it('allows adding components when an empty project view has empty SVG content', () => {
    const config: FuxaConfig = {
      devices: {
        device: {
          name: 'Device',
          tags: { 'tag-1': { id: 'tag-1', name: 'Pump', type: 'Bool' } },
        },
      },
      hmi: {
        views: [{
          id: 'view-1',
          name: 'MainView',
          items: {},
          svgcontent: '',
        }],
      },
    }
    const initial = model()
    let random = 1

    const result = createViewComponents(
      config,
      initial,
      new Map([['view-1', initial]]),
      [tag],
      {
        Parser: TestParser,
        crypto: {
          getRandomValues(bytes) {
            bytes.fill(random++)
            return bytes
          },
        },
      },
    )

    expect(result.components).toHaveLength(1)
    expect(result.components[0]?.tagId).toBe('tag-1')
  })

  it('creates managed rect components with unique IDs and sequential ordering', () => {
    const config: FuxaConfig = {
      devices: {
        device: {
          name: 'Device',
          tags: {
            'tag-1': { id: 'tag-1', name: 'Pump', type: 'Bool', extra: { floor: '2F' } },
            'tag-2': { id: 'tag-2', name: 'Valve', type: 'Bool', extra: { floor: '2F' } },
          },
        },
      },
      hmi: {
        views: [{
          id: 'view-1',
          items: { existing: {} },
          svgcontent: '<svg xmlns="http://www.w3.org/2000/svg" id="svg-existing"></svg>',
        }],
      },
    }
    let random = 1
    const initial = model()
    const result = createViewComponents(
      config,
      initial,
      new Map([['view-1', initial]]),
      [tag, { ...tag, id: 'tag-2', name: 'Valve' }],
      {
        Parser: TestParser,
        crypto: {
          getRandomValues(bytes) {
            bytes.fill(random++)
            return bytes
          },
        },
      },
    )
    const added = result.components

    expect(added).toHaveLength(2)
    expect(added.map((component) => component.seq)).toEqual([1, 2])
    expect(added.map((component) => component.tagId)).toEqual(['tag-1', 'tag-2'])
    expect(added.map((component) => component.label)).toEqual(['Pump', 'Valve'])
    expect(added.every((component) => component.template === 'rect'
      && component.palette === 'normal'
      && component.managed === true)).toBe(true)
    const ids = added.flatMap((component) => [
      component.shapeId,
      component.labelId,
      ...(component.shapeInnerIds ?? []),
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('existing')
    expect(ids).not.toContain('svg-existing')
    expect(initial.components).toHaveLength(0)
    expect(groupComponentsByFloor(added, buildTagIndex(config))).toMatchObject([
      { floor: '2F', items: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }] },
    ])
  })

  it('fails explicitly when any configured SVG cannot be scanned', () => {
    const config: FuxaConfig = {
      devices: {},
      hmi: {
        views: [{
          id: 'broken-view',
          name: 'Broken',
          svgcontent: 'not-svg',
        }],
      },
    }
    class BrokenParser implements SvgParser {
      parseFromString(): XMLDocument {
        return {
          documentElement: { localName: 'html' },
          getElementsByTagName: () => [],
        } as unknown as XMLDocument
      }
    }

    expect(() => createViewComponents(
      config,
      model(),
      new Map(),
      [tag],
      {
        Parser: BrokenParser,
        crypto: { getRandomValues: (bytes) => bytes },
      },
    )).toThrow('無法安全加入 Tag 元件：View「Broken」的 SVG ID 無法檢查')
  })

  it('creates one multi-state component per Tag and binds each Tag to the highest-priority state', () => {
    const initial = model()
    const iconSet = {
      id: 'set-tank',
      name: 'Tank',
      type: 'multi-state' as const,
      normal: {
        id: 'tank-normal',
        mimeType: 'image/gif' as const,
        dataUrl: 'data:image/gif;base64,R0lGODlh',
      },
      states: [
        {
          key: 'alarm',
          name: 'Alarm',
          asset: {
            id: 'tank-alarm',
            mimeType: 'image/gif' as const,
            dataUrl: 'data:image/gif;base64,R0lGODlh',
          },
        },
        {
          key: 'high',
          name: 'High',
          asset: {
            id: 'tank-high',
            mimeType: 'image/gif' as const,
            dataUrl: 'data:image/gif;base64,R0lGODlh',
          },
        },
      ],
    }
    let random = 1
    const result = createViewComponents(
      { devices: {}, hmi: { views: [] } },
      initial,
      new Map([['view-1', initial]]),
      [tag],
      {
        Parser: TestParser,
        crypto: {
          getRandomValues(bytes) {
            bytes.fill(random++)
            return bytes
          },
        },
      },
      `multi:${iconSet.id}`,
      [iconSet],
    )
    expect(result.components).toHaveLength(1)
    expect(result.components[0]).toMatchObject({
      template: 'icon-multi',
      tagId: 'tag-1',
      multiIconSetId: 'set-tank',
      normalIconId: 'tank-normal',
      multiStateBindings: [
        { stateKey: 'alarm', iconId: 'tank-alarm', tagId: 'tag-1' },
        { stateKey: 'high', iconId: 'tank-high', tagId: '' },
      ],
    })
  })
})
