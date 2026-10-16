import { describe, expect, it } from 'vitest'
import { moveManagedComponent } from '../../../src/features/views/moveManagedComponent'

function component(
  key: string,
  tagId: string,
  managed = true,
) {
  return { key, tagId, managed }
}

describe('moveManagedComponent', () => {
  const tags = new Map([
    ['a', { floor: '1F' }],
    ['b', { floor: '1F' }],
    ['c', { floor: '2F' }],
    ['missing', { floor: '' }],
  ])

  it('moves a managed component within the same floor ordering', () => {
    const components = [
      component('a', 'a'),
      component('c', 'c'),
      component('b', 'b'),
    ]

    expect(moveManagedComponent(components, 'b', -1, tags).map(({ key }) => key))
      .toEqual(['b', 'c', 'a'])
  })

  it('does not move past a floor boundary or reorder unmanaged components', () => {
    const components = [
      component('a', 'a'),
      component('readonly', 'a', false),
      component('b', 'b'),
      component('c', 'c'),
    ]

    expect(moveManagedComponent(components, 'a', -1, tags).map(({ key }) => key))
      .toEqual(['a', 'readonly', 'b', 'c'])
    expect(moveManagedComponent(components, 'b', 1, tags).map(({ key }) => key))
      .toEqual(['a', 'readonly', 'b', 'c'])
    expect(moveManagedComponent(components, 'readonly', 1, tags).map(({ key }) => key))
      .toEqual(['a', 'readonly', 'b', 'c'])
  })
})
