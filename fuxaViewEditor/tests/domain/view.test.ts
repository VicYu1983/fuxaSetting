import { describe, expect, it } from 'vitest'
import { hasViewShape, removeLayoutViewReferences } from '../../src/domain/views/view'

describe('View domain helpers', () => {
  it('validates FUXA View shape without accepting an array as items', () => {
    expect(hasViewShape({ id: 'v1', items: {}, svgcontent: '<svg/>' })).toBe(true)
    expect(hasViewShape({ id: 'v1', items: [], svgcontent: '<svg/>' })).toBe(false)
    expect(hasViewShape({ id: 'v1', items: {}, svgcontent: null })).toBe(false)
    expect(hasViewShape(null)).toBe(false)
  })

  it('removes nested navigation entries and redirects the start View', () => {
    const layout = {
      start: 'old',
      navigation: {
        items: [
          {
            text: 'Group',
            view: 'other',
            children: [
              { text: 'Remove me', view: 'old' },
              { text: 'Keep me', view: 'other' },
            ],
          },
          { text: 'Remove group', view: 'old', children: [] },
        ],
      },
      metadata: { lastVisited: 'old' },
    }

    expect(removeLayoutViewReferences(layout, 'old', 'other')).toBe(3)
    expect(layout.start).toBe('other')
    expect(layout.navigation.items).toEqual([{
      text: 'Group',
      view: 'other',
      children: [{ text: 'Keep me', view: 'other' }],
    }])
    expect(layout.metadata.lastVisited).toBe('old')
  })

  it('removes object references but preserves the special start field', () => {
    const layout = {
      start: 'old',
      nested: { view: 'old', start: 'old' },
      list: [{ other: { view: 'old' } }],
    }

    expect(removeLayoutViewReferences(layout, 'old', 'replacement')).toBe(3)
    expect(layout).toEqual({
      start: 'replacement',
      nested: { start: 'old' },
      list: [{ other: {} }],
    })
  })
})
