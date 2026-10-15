export interface EditorSnapshot<T, D> {
  models: Map<string, T>
  modifiedViewIds: Set<string>
  document: D | null
  configurationDirty: boolean
}

export interface EditorHistoryState<T, D> extends EditorSnapshot<T, D> {
  past: EditorSnapshot<T, D>[]
  future: EditorSnapshot<T, D>[]
}

export type EditorHistoryAction<T, D> =
  | { type: 'edit'; viewId: string; model: T }
  | { type: 'document-edit'; document: D; models: Map<string, T>; modifiedViewIds?: Set<string> }
  | { type: 'reset'; models: Map<string, T>; document?: D | null }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 50

export function createEditorHistoryState<T, D = unknown>(
  models = new Map<string, T>(),
  document: D | null = null,
): EditorHistoryState<T, D> {
  return {
    models,
    modifiedViewIds: new Set(),
    document,
    configurationDirty: false,
    past: [],
    future: [],
  }
}

function snapshot<T, D>(state: EditorHistoryState<T, D>): EditorSnapshot<T, D> {
  return {
    models: state.models,
    modifiedViewIds: state.modifiedViewIds,
    document: state.document,
    configurationDirty: state.configurationDirty,
  }
}

export function editorHistoryReducer<T, D>(
  state: EditorHistoryState<T, D>,
  action: EditorHistoryAction<T, D>,
): EditorHistoryState<T, D> {
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
        document: state.document,
        configurationDirty: state.configurationDirty,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }
    case 'document-edit':
      return {
        models: action.models,
        modifiedViewIds: action.modifiedViewIds ?? state.modifiedViewIds,
        document: action.document,
        configurationDirty: true,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    case 'reset':
      return createEditorHistoryState<T, D>(action.models, action.document ?? null)
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
