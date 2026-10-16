import { describe, expect, it } from 'vitest'
import { readManagedComponents } from '../../src/domain/svg/readManagedComponents'
import type { MultiStateIconSet } from '../../src/domain/icons/iconLibrary'

class TestElement {
  readonly localName: string
  readonly attributes: Record<string, string>
  readonly children: TestElement[]
  readonly textContent: string

  constructor(
    localName: string,
    attributes: Record<string, string> = {},
    textContent = '',
    children: TestElement[] = [],
  ) {
    this.localName = localName
    this.attributes = attributes
    this.textContent = textContent
    this.children = children
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }

  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      if (selector === 'image[data-fuxa-icon-id]'
          && child.localName === 'image'
          && child.getAttribute('data-fuxa-icon-id')) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }

  querySelectorAll(selector: string): TestElement[] {
    const matches: TestElement[] = []
    const visit = (node: TestElement): void => {
      for (const child of node.children) {
        if (selector === '[id]' && child.getAttribute('id')) matches.push(child)
        visit(child)
      }
    }
    visit(this)
    return matches
  }
}

function makeDocument(root: TestElement): XMLDocument {
  const all: TestElement[] = []
  const visit = (node: TestElement): void => {
    all.push(node)
    node.children.forEach(visit)
  }
  visit(root)
  return {
    getElementsByTagName() {
      return all
    },
  } as unknown as XMLDocument
}

describe('readManagedComponents', () => {
  it('loads managed shapes and labels, preserving palette and inner SVG IDs', () => {
    const root = new TestElement('svg', {}, '', [
      new TestElement('g', { id: 'shape-2' }, '', [
        new TestElement('rect', { id: 'inner-shape' }),
      ]),
      new TestElement('text', { id: 'label-2' }, 'Pump'),
      new TestElement('path', { id: 'shape-1' }),
      new TestElement('text', { id: 'label-1' }, 'Fan'),
    ])
    const result = readManagedComponents({
      'shape-2': {
        id: 'shape-2',
        name: 'tc_2',
        type: 'svg-ext-shapes-cylinder',
        property: {
          variableId: 'tag-pump',
          ranges: [{ color: '#ff0000ff' }],
        },
      },
      'label-2': { id: 'label-2', name: 'tc_2_label', type: 'svg-ext-shapes-text' },
      'shape-1': {
        id: 'shape-1',
        name: 'tc_1',
        type: 'svg-ext-shapes-select',
        property: {
          variableId: 'tag-fan',
          ranges: [{ color: '#00ff07ff' }],
        },
      },
      'label-1': { id: 'label-1', name: 'tc_1_label', type: 'svg-ext-shapes-text' },
    }, makeDocument(root))

    expect(result.records).toEqual([
      {
        key: 'loaded-1',
        seq: 1,
        tagId: 'tag-fan',
        label: 'Fan',
        template: 'rect',
        palette: 'normal',
        shapeId: 'shape-1',
        labelId: 'label-1',
        shapeInnerIds: [],
        managed: true,
      },
      {
        key: 'loaded-2',
        seq: 2,
        tagId: 'tag-pump',
        label: 'Pump',
        template: 'cylinder',
        palette: 'alarm',
        shapeId: 'shape-2',
        labelId: 'label-2',
        shapeInnerIds: ['inner-shape'],
        managed: true,
      },
    ])
    expect([...result.consumed]).toEqual(['shape-2', 'label-2', 'shape-1', 'label-1'])
  })

  it('detects icon pairs and derives the visibility inversion state', () => {
    const root = new TestElement('svg', {}, '', [
      new TestElement('image', { id: 'normal-shape', 'data-fuxa-icon-id': 'icon-normal' }),
      new TestElement('image', { id: 'alarm-shape', 'data-fuxa-icon-id': 'icon-alarm' }),
      new TestElement('text', { id: 'label' }, 'Fire pump'),
    ])
    const normalActions = [
      { variableId: 'tag-fire', range: { min: 0, max: 0 }, type: 'hide' },
      { variableId: 'tag-fire', range: { min: 1, max: 1 }, type: 'show' },
    ]
    const alarmActions = [
      { variableId: 'tag-fire', range: { min: 0, max: 0 }, type: 'show' },
      { variableId: 'tag-fire', range: { min: 1, max: 1 }, type: 'hide' },
    ]
    const result = readManagedComponents({
      'normal-shape': {
        id: 'normal-shape',
        name: 'tc_5',
        type: 'svg-ext-shapes-select',
        property: { actions: normalActions },
      },
      'alarm-shape': {
        id: 'alarm-shape',
        name: 'tc_5_alarm',
        type: 'svg-ext-shapes-select',
        property: { actions: alarmActions },
      },
      label: { id: 'label', name: 'tc_5_label', type: 'svg-ext-shapes-text' },
    }, makeDocument(root))

    expect(result.records).toEqual([{
      key: 'loaded-5',
      seq: 5,
      tagId: 'tag-fire',
      label: 'Fire pump',
      template: 'icon-pair',
      normalIconId: 'icon-normal',
      alarmIconId: 'icon-alarm',
      alarmShapeId: 'alarm-shape',
      invertIconState: true,
      palette: 'normal',
      shapeId: 'normal-shape',
      labelId: 'label',
      shapeInnerIds: [],
      managed: true,
    }])
    expect(result.consumed.has('alarm-shape')).toBe(true)
  })

  it('restores icon pair IDs from embedded images when FUXA strips custom SVG attributes', () => {
    const root = new TestElement('svg', {}, '', [
      new TestElement('image', {
        id: 'normal-shape',
        'xlink:href': 'data:image/png;base64,normal',
      }),
      new TestElement('image', {
        id: 'alarm-shape',
        'xlink:href': 'data:image/png;base64,alarm',
      }),
      new TestElement('text', { id: 'label' }, 'Fire pump'),
    ])
    const actions = [
      { variableId: 'tag-fire', range: { min: 0, max: 0 }, type: 'show' },
      { variableId: 'tag-fire', range: { min: 1, max: 1 }, type: 'hide' },
    ]
    const result = readManagedComponents({
      'normal-shape': {
        id: 'normal-shape',
        name: 'tc_5',
        type: 'svg-ext-shapes-select',
        property: { actions },
      },
      'alarm-shape': {
        id: 'alarm-shape',
        name: 'tc_5_alarm',
        type: 'svg-ext-shapes-select',
        property: { actions },
      },
      label: { id: 'label', name: 'tc_5_label', type: 'svg-ext-shapes-text' },
    }, makeDocument(root), new Set(), new Map([
      ['data:image/png;base64,normal', 'normal-icon-id'],
      ['data:image/png;base64,alarm', 'alarm-icon-id'],
    ]))

    expect(result.records[0]).toMatchObject({
      template: 'icon-pair',
      normalIconId: 'normal-icon-id',
      alarmIconId: 'alarm-icon-id',
    })
  })

  it('loads multi-state bindings in configured priority order', () => {
    const root = new TestElement('svg', {}, '', [
      new TestElement('image', {
        id: 'normal',
        'data-name': 'tc_8',
        'data-fuxa-icon-id': 'normal-asset',
        'data-fuxa-icon-set-id': 'tank-set',
        'data-fuxa-state-key': 'normal',
      }),
      new TestElement('image', {
        id: 'high',
        'data-name': 'tc_8_state_high',
        'data-fuxa-icon-id': 'high-asset',
        'data-fuxa-icon-set-id': 'tank-set',
        'data-fuxa-state-key': 'high',
        'data-fuxa-state-priority': '1',
      }),
      new TestElement('image', {
        id: 'alarm',
        'data-name': 'tc_8_state_alarm',
        'data-fuxa-icon-id': 'alarm-asset',
        'data-fuxa-icon-set-id': 'tank-set',
        'data-fuxa-state-key': 'alarm',
        'data-fuxa-state-priority': '0',
      }),
      new TestElement('text', { id: 'label-8' }, 'Tank'),
    ])
    const result = readManagedComponents({
      normal: { id: 'normal', name: 'tc_8', type: 'svg-ext-shapes-select', property: {} },
      high: {
        id: 'high',
        name: 'tc_8_state_high',
        type: 'svg-ext-shapes-select',
        property: { actions: [{ variableId: 'tag-high' }] },
      },
      alarm: {
        id: 'alarm',
        name: 'tc_8_state_alarm',
        type: 'svg-ext-shapes-select',
        property: { actions: [{ variableId: 'tag-alarm' }] },
      },
      'label-8': { id: 'label-8', name: 'tc_8_label', type: 'svg-ext-shapes-text' },
    }, makeDocument(root))
    expect(result.records[0]).toMatchObject({
      template: 'icon-multi',
      tagId: 'tag-alarm',
      normalIconId: 'normal-asset',
      multiIconSetId: 'tank-set',
      multiStateBindings: [
        { stateKey: 'alarm', iconId: 'alarm-asset', tagId: 'tag-alarm', shapeId: 'alarm' },
        { stateKey: 'high', iconId: 'high-asset', tagId: 'tag-high', shapeId: 'high' },
      ],
    })
    expect(result.consumed.has('high')).toBe(true)
    expect(result.consumed.has('alarm')).toBe(true)
  })

  it('recovers multi-state components from exported FUXA SVG images and item names', () => {
    const normalUrl = 'data:image/gif;base64,normal'
    const alarmUrl = 'data:image/gif;base64,alarm'
    const warningUrl = 'data:image/gif;base64,warning'
    const root = new TestElement('svg', {}, '', [
      new TestElement('image', {
        id: 'normal',
        'data-name': 'tc_8',
        'xlink:href': normalUrl,
      }),
      new TestElement('image', {
        id: 'alarm',
        'data-name': 'tc_8_state_alarm',
        'xlink:href': alarmUrl,
      }),
      new TestElement('image', {
        id: 'warning',
        'data-name': 'tc_8_state_warning',
        'xlink:href': warningUrl,
      }),
      new TestElement('text', { id: 'label-8' }, 'Tank'),
    ])
    const iconSet: MultiStateIconSet = {
      id: 'tank-set',
      name: 'Tank',
      type: 'multi-state',
      normal: { id: 'tank-normal', mimeType: 'image/gif', dataUrl: normalUrl },
      states: [
        {
          key: 'warning',
          name: 'Warning',
          asset: { id: 'tank-warning', mimeType: 'image/gif', dataUrl: warningUrl },
        },
        {
          key: 'alarm',
          name: 'Alarm',
          asset: { id: 'tank-alarm', mimeType: 'image/gif', dataUrl: alarmUrl },
        },
      ],
    }
    const result = readManagedComponents({
      normal: { id: 'normal', name: 'tc_8', type: 'svg-ext-shapes-select', property: {} },
      alarm: {
        id: 'alarm',
        name: 'tc_8_state_alarm',
        type: 'svg-ext-shapes-select',
        property: { actions: [{ variableId: 'tag-alarm' }] },
      },
      warning: {
        id: 'warning',
        name: 'tc_8_state_warning',
        type: 'svg-ext-shapes-select',
        property: { actions: [{ variableId: 'tag-warning' }] },
      },
      'label-8': { id: 'label-8', name: 'tc_8_label', type: 'svg-ext-shapes-text' },
    }, makeDocument(root), new Set(), new Map([
      [normalUrl, iconSet.normal.id],
      [alarmUrl, iconSet.states[1]!.asset.id],
      [warningUrl, iconSet.states[0]!.asset.id],
    ]), [iconSet])

    expect(result.records[0]).toMatchObject({
      template: 'icon-multi',
      multiIconSetId: 'tank-set',
      normalIconId: 'tank-normal',
      tagId: 'tag-warning',
      multiStateBindings: [
        {
          stateKey: 'warning',
          iconId: 'tank-warning',
          tagId: 'tag-warning',
          shapeId: 'warning',
        },
        {
          stateKey: 'alarm',
          iconId: 'tank-alarm',
          tagId: 'tag-alarm',
          shapeId: 'alarm',
        },
      ],
    })
    expect(result.consumed).toContain('alarm')
    expect(result.consumed).toContain('warning')
  })

  it('ignores incomplete managed entries, invalid labels, and previously consumed shapes', () => {
    const root = new TestElement('svg', {}, '', [
      new TestElement('rect', { id: 'shape' }),
      new TestElement('path', { id: 'bad-label' }),
      new TestElement('text', { id: 'consumed-label' }, 'Skip'),
    ])
    const result = readManagedComponents({
      shape: { id: 'shape', name: 'tc_1', property: { variableId: 'tag-1' } },
      'bad-label': { id: 'bad-label', name: 'tc_1_label', type: 'svg-ext-shapes-text' },
      consumed: { id: 'consumed', name: 'tc_2', property: { variableId: 'tag-2' } },
      'consumed-label': { id: 'consumed-label', name: 'tc_2_label', type: 'svg-ext-shapes-text' },
    }, makeDocument(root), new Set(['consumed']))
    expect(result.records).toEqual([])
    expect([...result.consumed]).toEqual(['consumed'])
  })
})
