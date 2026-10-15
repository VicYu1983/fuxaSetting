import { describe, expect, it } from 'vitest'
import {
  createEditorHistoryState,
  editorHistoryReducer,
} from '../../src/app/store/editorHistory'

describe('editorHistoryReducer', () => {
  it('restores model data and dirty views through undo and redo', () => {
    const initialModel = { label: 'Original' }
    const editedModel = { label: 'Updated' }
    const initial = createEditorHistoryState(new Map([['view-1', initialModel]]))

    const edited = editorHistoryReducer(initial, {
      type: 'edit',
      viewId: 'view-1',
      model: editedModel,
    })
    const undone = editorHistoryReducer(edited, { type: 'undo' })
    const redone = editorHistoryReducer(undone, { type: 'redo' })

    expect(undone.models.get('view-1')).toBe(initialModel)
    expect(undone.modifiedViewIds).toEqual(new Set())
    expect(redone.models.get('view-1')).toBe(editedModel)
    expect(redone.modifiedViewIds).toEqual(new Set(['view-1']))
  })

  it('drops the redo branch after a new edit', () => {
    const initial = createEditorHistoryState(new Map([['view-1', 'one']]))
    const firstEdit = editorHistoryReducer(initial, {
      type: 'edit',
      viewId: 'view-1',
      model: 'two',
    })
    const undone = editorHistoryReducer(firstEdit, { type: 'undo' })
    const branched = editorHistoryReducer(undone, {
      type: 'edit',
      viewId: 'view-1',
      model: 'three',
    })

    expect(branched.models.get('view-1')).toBe('three')
    expect(branched.future).toHaveLength(0)
    expect(editorHistoryReducer(branched, { type: 'redo' })).toBe(branched)
  })

  it('limits history to 50 edits and clears it on reset', () => {
    let state = createEditorHistoryState(new Map([['view-1', 0]]))
    for (let value = 1; value <= 55; value += 1) {
      state = editorHistoryReducer(state, {
        type: 'edit',
        viewId: 'view-1',
        model: value,
      })
    }

    expect(state.past).toHaveLength(50)
    const reset = editorHistoryReducer(state, {
      type: 'reset',
      models: new Map([['view-1', 55]]),
    })
    expect(reset.modifiedViewIds).toEqual(new Set())
    expect(reset.past).toHaveLength(0)
    expect(reset.future).toHaveLength(0)
  })

  it('does not create an undo step when an edit preserves the model reference', () => {
    const model = { label: 'Same' }
    const state = createEditorHistoryState(new Map([['view-1', model]]))

    expect(editorHistoryReducer(state, {
      type: 'edit',
      viewId: 'view-1',
      model,
    })).toBe(state)
  })

  it('restores document edits and their model collection through undo and redo', () => {
    const firstDocument = { views: ['first'] }
    const secondDocument = { views: ['first', 'second'] }
    const firstModels = new Map([['first', { label: 'First' }]])
    const secondModels = new Map([
      ['first', { label: 'First' }],
      ['second', { label: 'Second' }],
    ])
    const initial = createEditorHistoryState(firstModels, firstDocument)
    const edited = editorHistoryReducer(initial, {
      type: 'document-edit',
      document: secondDocument,
      models: secondModels,
    })
    const undone = editorHistoryReducer(edited, { type: 'undo' })
    const redone = editorHistoryReducer(undone, { type: 'redo' })

    expect(edited.configurationDirty).toBe(true)
    expect(undone.document).toBe(firstDocument)
    expect(undone.models).toBe(firstModels)
    expect(undone.configurationDirty).toBe(false)
    expect(redone.document).toBe(secondDocument)
    expect(redone.models).toBe(secondModels)
    expect(redone.configurationDirty).toBe(true)
  })
})
