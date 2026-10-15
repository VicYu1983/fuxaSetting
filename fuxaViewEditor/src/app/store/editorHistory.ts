export interface EditorSnapshot<T> {
  models: Map<string, T>
  modifiedViewIds: Set<string>
}

export interface EditorHistoryState<T> extends EditorSnapshot<T> {
  past: EditorSnapshot<T>[]
  future: EditorSnapshot<T>[]
}

export type EditorHistoryAction<T> =
  | { type: 'edit'; viewId: string; model: T }
  | { type: 'reset'; models: Map<string, T> }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 50

export function createEditorHistoryState<T>(
  models = new Map<string, T>(),
): EditorHistoryState<T> {
  return {
    models,
    modifiedViewIds: new Set(),
    past: [],
    future: [],
  }
}

function snapshot<T>(state: EditorHistoryState<T>): EditorSnapshot<T> {
  return {
    models: state.models,
    modifiedViewIds: state.modifiedViewIds,
  }
}

export function editorHistoryReducer<T>(
  state: EditorHistoryState<T>,
  action: EditorHistoryAction<T>,
): EditorHistoryState<T> {
  switch (action.type) {
    case 'edit': {
      if (state.models.get(action.viewId) === action.model) return state

      const models = new Map(state.models)
      models.set(action.viewId, action.model)
      const modifiedViewIds = new Set(state.modifiedViewIds)
      modifiedViewIds.add(action.viewId)
      return {
        models,
        modifiedViewIds,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }
    case 'reset':
      return createEditorHistoryState(action.models)
    case 'undo': {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        ...previous,
        past: state.past.slice(0, -1),
        future: [...state.future, snapshot(state)].slice(-HISTORY_LIMIT),
      }
    }
    case 'redo': {
      const next = state.future.at(-1)
      if (!next) return state
      return {
        ...next,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(0, -1),
      }
    }
  }
}
