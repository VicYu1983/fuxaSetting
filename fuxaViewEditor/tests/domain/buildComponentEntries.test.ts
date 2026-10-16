import { describe, expect, it } from 'vitest'
import type { SvgComponent } from '../../src/domain/svg/buildComponentNodes'
import { buildComponentEntries } from '../../src/domain/svg/buildComponentEntries'

class TestElement {
  readonly attributes: Record<string, string>

  constructor(attributes: Record<string, string>) {
    this.attributes = attributes
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null
  }
}

function component(overrides: Partial<SvgComponent> = {}): SvgComponent {
  return {
    key: 'component-1',
    seq: 3,
    tagId: 'tag-3',
    label: 'Pump',
    template: 'rect',
    palette: 'normal',
    shapeId: 'shape-3',
    labelId: 'label-3',
    shapeInnerIds: [],
    managed: true,
    ...overrides,
  }
}

describe('buildComponentEntries', () => {
  it('builds standard item entries with FUXA ranges and preserves prior properties', () => {
    const existingShape = {
      custom: 1,
      property: {
        events: [{ eventId: 'keep-event' }],
        actions: [{ actionId: 'keep-action' }],
        customProperty: 'keep',
      },
    }
    const result = buildComponentEntries(
      component({ palette: 'alarm' }),
      [new TestElement({ id: 'shape-3', type: 'svg-ext-shapes-cylinder' }) as unknown as Element],
      {
        shape: existingShape,
        label: { previousLabelField: true },
      },
    )

    expect(result.shapeEntries[0]).toMatchObject({
      custom: 1,
      id: 'shape-3',
      type: 'svg-ext-shapes-cylinder',
      name: 'tc_3',
      label: 'Shapes',
      hide: false,
      lock: false,
      property: {
        variableId: 'tag-3',
        customProperty: 'keep',
        events: [{ eventId: 'keep-event' }],
        actions: [{ actionId: 'keep-action' }],
        ranges: [
          { min: 1, max: 1, color: '#ff0000ff', type: 2, stroke: '' },
          { min: 0, max: 0, color: '#00ff07ff', type: 2, stroke: '' },
        ],
      },
    })
    expect(result.labelEntry).toMatchObject({
      previousLabelField: true,
      id: 'label-3',
      name: 'tc_3_label',
      property: null,
    })
  })

  it('builds a FUXA click-to-toggle event for a Coil Switch', () => {
    const result = buildComponentEntries(
      component({ template: 'switch' }),
      [new TestElement({ id: 'shape-3', type: 'svg-ext-html_switch' }) as unknown as Element],
      {},
      {
        name: 'Pump',
        type: 'Bool',
        memaddress: '000000',
        record: { id: 'tag-3', name: 'Pump', type: 'Bool', init: '0' },
      },
    )

    expect(result.shapeEntries[0]).toMatchObject({
      id: 'shape-3',
      type: 'svg-ext-html_switch',
      name: 'tc_3',
      label: 'HtmlSwitch',
      property: {
        variableId: null,
        events: [{
          type: 'click',
          action: 'onToggleValue',
          actoptions: {
            variable: {
              variableId: 'tag-3',
              variableRaw: {
                id: 'tag-3',
                name: 'Pump',
                type: 'boolean',
                value: false,
                init: '0',
              },
              bitmask: null,
            },
          },
        }],
        actions: [],
        options: { offValue: 0, onValue: 1, height: 22 },
      },
    })
    expect(result.labelEntry).toMatchObject({
      id: 'label-3',
      name: 'tc_3_label',
    })
  })

  it('removes only the generated toggle event when changing a Switch to a shape', () => {
    const existing = {
      type: 'svg-ext-html_switch',
      property: {
        events: [
          { type: 'click', action: 'onToggleValue' },
          { type: 'click', action: 'customAction' },
        ],
      },
    }
    const result = buildComponentEntries(
      component(),
      [new TestElement({ id: 'shape-3', type: 'svg-ext-shapes-rectangle' }) as unknown as Element],
      { shape: existing },
    )

    expect((existing.property.events[0])).toMatchObject({
      action: 'onToggleValue',
    })
    expect(result.shapeEntries[0]?.property).toMatchObject({
      events: [{ type: 'click', action: 'customAction' }],
    })
  })

  it('builds complementary icon pair actions and retains events but not variableId', () => {
    const model = component({
      template: 'icon-pair',
      invertIconState: true,
      normalIconId: 'normal',
      alarmIconId: 'alarm',
      alarmShapeId: 'alarm-shape',
    })
    const result = buildComponentEntries(
      model,
      [
        new TestElement({
          id: 'shape-3',
          'data-name': 'tc_3',
        }) as unknown as Element,
        new TestElement({
          id: 'alarm-shape',
          'data-name': 'tc_3_alarm',
        }) as unknown as Element,
      ],
      {
        shape: { property: { variableId: 'stale', events: [{ id: 1 }] } },
        alarmShape: { property: { events: [{ id: 2 }] } },
      },
    )

    expect(result.shapeEntries).toEqual([
      expect.objectContaining({
        id: 'shape-3',
        name: 'tc_3',
        property: {
          ranges: [],
          events: [{ id: 1 }],
          actions: [
            {
              variableId: 'tag-3',
              range: { min: 0, max: 0 },
              type: 'hide',
              options: {},
            },
            {
              variableId: 'tag-3',
              range: { min: 1, max: 1 },
              type: 'show',
              options: {},
            },
          ],
        },
      }),
      expect.objectContaining({
        id: 'alarm-shape',
        name: 'tc_3_alarm',
        property: {
          ranges: [],
          events: [{ id: 2 }],
          actions: [
            {
              variableId: 'tag-3',
              range: { min: 0, max: 0 },
              type: 'show',
              options: {},
            },
            {
              variableId: 'tag-3',
              range: { min: 1, max: 1 },
              type: 'hide',
              options: {},
            },
          ],
        },
      }),
    ])
  })

  it('builds normal and per-Tag actions for stacked multi-state images', () => {
    const model = component({
      template: 'icon-multi',
      multiIconSetId: 'icon-set-tank',
      normalIconId: 'normal-asset',
      multiStateBindings: [
        { stateKey: 'alarm', iconId: 'alarm-asset', tagId: 'tag-alarm', shapeId: 'shape-alarm' },
        { stateKey: 'high', iconId: 'high-asset', tagId: 'tag-high', shapeId: 'shape-high' },
      ],
    })
    const result = buildComponentEntries(model, [
      new TestElement({ id: 'shape-3', 'data-name': 'tc_3', 'data-fuxa-state-key': 'normal' }) as unknown as Element,
      new TestElement({
        id: 'shape-high',
        'data-name': 'tc_3_state_high',
        'data-fuxa-state-key': 'high',
      }) as unknown as Element,
      new TestElement({
        id: 'shape-alarm',
        'data-name': 'tc_3_state_alarm',
        'data-fuxa-state-key': 'alarm',
      }) as unknown as Element,
    ])
    expect(result.shapeEntries.map((entry) => entry.id))
      .toEqual(['shape-3', 'shape-high', 'shape-alarm'])
    expect(result.shapeEntries[0]?.property).toMatchObject({ actions: [], ranges: [] })
    expect(result.shapeEntries[1]?.property).toMatchObject({
      actions: [
        { variableId: 'tag-high', range: { min: 0, max: 0 }, type: 'hide' },
        { variableId: 'tag-high', range: { min: 1, max: 1 }, type: 'show' },
      ],
    })
    expect(result.shapeEntries[2]?.property).toMatchObject({
      actions: [
        { variableId: 'tag-alarm', range: { min: 0, max: 0 }, type: 'hide' },
        { variableId: 'tag-alarm', range: { min: 1, max: 1 }, type: 'show' },
      ],
    })
  })

  it('rejects incomplete icon pairs and missing standard nodes', () => {
    expect(() => buildComponentEntries(
      component({ template: 'icon-pair' }),
      [],
    )).toThrow('正常／告警圖示節點不完整。')
    expect(() => buildComponentEntries(
      component(),
      [],
    )).toThrow('缺少圖示節點。')
  })
})
