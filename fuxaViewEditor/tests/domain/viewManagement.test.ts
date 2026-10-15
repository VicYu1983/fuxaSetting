import { describe, expect, it } from 'vitest'
import type { FuxaConfig } from '../../src/domain/config/types'
import { isRecord } from '../../src/domain/config/validateFuxaConfig'
import { deleteView, renameView, validateViewName } from '../../src/domain/views/viewManagement'

function configWithViews(viewIds: string[]): FuxaConfig {
  return {
    devices: {},
    hmi: {
      views: viewIds.map((id) => ({ id, name: id })),
      layout: {
        start: viewIds[0],
        navigation: {
          items: viewIds.map((id) => ({ text: id, view: id })),
        },
      },
    },
  }
}

describe('View name management', () => {
  it('trims names, ignores case for duplicates, and supports excluding the renamed View', () => {
    const views = [
      { id: 'one', name: 'Overview' },
      { id: 'two', name: 'Details' },
    ]
    expect(validateViewName(views, '  New page  ')).toEqual({ valid: true, name: 'New page' })
    expect(validateViewName(views, ' details ')).toEqual({ valid: false, reason: 'duplicate' })
    expect(validateViewName(views, '  ')).toEqual({ valid: false, reason: 'empty' })
    expect(validateViewName(views, ' overview ', 'one')).toEqual({
      valid: true,
      name: 'overview',
    })
  })

  it('renames in place, treats an unchanged name as success, and reports invalid requests', () => {
    const views: unknown[] = [
      { id: 'one', name: 'Overview' },
      { id: 'two', name: 'Details' },
    ]
    expect(renameView(views, 'one', '  Main  ')).toMatchObject({
      renamed: true,
      changed: true,
      view: { id: 'one', name: 'Main' },
    })
    expect(renameView(views, 'one', 'Main')).toMatchObject({ renamed: true, changed: false })
    expect(renameView(views, 'one', 'Details')).toEqual({
      renamed: false,
      reason: 'duplicate',
    })
    expect(renameView(views, 'missing', 'New')).toEqual({
      renamed: false,
      reason: 'not-found',
    })
  })
})

describe('View deletion', () => {
  it('deletes a View, selects the next available fallback, and clears navigation references', () => {
    const config = configWithViews(['first', 'removed', 'last'])
    const result = deleteView(config, 'removed')

    expect(result).toMatchObject({
      deleted: true,
      removedView: { id: 'removed' },
      fallbackView: { id: 'last' },
      referenceCount: 1,
    })
    expect(config.hmi.views.map((view) => isRecord(view) ? view.id : undefined))
      .toEqual(['first', 'last'])
    expect(config.hmi.layout).toEqual({
      start: 'first',
      navigation: {
        items: [
          { text: 'first', view: 'first' },
          { text: 'last', view: 'last' },
        ],
      },
    })
  })

  it('uses the preceding View when deleting the final View', () => {
    const config = configWithViews(['first', 'last'])
    const result = deleteView(config, 'last')
    expect(result).toMatchObject({ deleted: true, fallbackView: { id: 'first' } })
    expect(config.hmi.views).toEqual([{ id: 'first', name: 'first' }])
    const layout = config.hmi.layout
    if (!isRecord(layout)) throw new Error('Expected a layout object')
    expect(layout.start).toBe('first')
  })

  it('never deletes the only View or mutates the configuration for invalid requests', () => {
    const onlyView = configWithViews(['only'])
    expect(deleteView(onlyView, 'only')).toEqual({ deleted: false, reason: 'last-view' })
    expect(onlyView.hmi.views).toHaveLength(1)

    const config = configWithViews(['first', 'second'])
    const before = structuredClone(config)
    expect(deleteView(config, 'missing')).toEqual({ deleted: false, reason: 'not-found' })
    expect(config).toEqual(before)
  })
})
