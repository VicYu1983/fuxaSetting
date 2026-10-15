import type { FuxaConfig } from '../config/types'
import { isRecord } from '../config/validateFuxaConfig'
import { removeLayoutViewReferences } from './view'

export type ViewNameValidation =
  | { valid: true; name: string }
  | { valid: false; reason: 'empty' | 'duplicate' | 'not-found' }

export function validateViewName(
  views: readonly unknown[],
  name: unknown,
  excludeViewId?: string,
): ViewNameValidation {
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  if (!normalizedName) return { valid: false, reason: 'empty' }

  const duplicate = views.some((view) =>
    isRecord(view)
    && view.id !== excludeViewId
    && typeof view.name === 'string'
    && view.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
  )
  if (duplicate) return { valid: false, reason: 'duplicate' }
  return { valid: true, name: normalizedName }
}

export type ViewRenameResult =
  | { renamed: true; view: Record<string, unknown>; changed: boolean }
  | { renamed: false; reason: 'not-found' | 'empty' | 'duplicate' }

export function renameView(
  views: readonly unknown[],
  viewId: string,
  name: unknown,
): ViewRenameResult {
  const view = views.find((candidate) => isRecord(candidate) && candidate.id === viewId)
  if (!isRecord(view)) return { renamed: false, reason: 'not-found' }
  const validation = validateViewName(views, name, viewId)
  if (!validation.valid) return { renamed: false, reason: validation.reason }
  const changed = view.name !== validation.name
  if (changed) view.name = validation.name
  return { renamed: true, view, changed }
}

export interface ViewDeletionResult {
  deleted: boolean
  reason?: 'not-found' | 'last-view'
  removedView?: unknown
  fallbackView?: Record<string, unknown>
  referenceCount?: number
}

export function deleteView(config: FuxaConfig, viewId: string): ViewDeletionResult {
  const views = config.hmi.views
  if (views.length <= 1) return { deleted: false, reason: 'last-view' }
  const index = views.findIndex((view) => isRecord(view) && view.id === viewId)
  if (index < 0) return { deleted: false, reason: 'not-found' }

  const remainingViews = views.filter((_, viewIndex) => viewIndex !== index)
  const fallbackIndex = Math.min(index, remainingViews.length - 1)
  const fallback = remainingViews[fallbackIndex]
  if (!isRecord(fallback)) throw new Error('找不到可切換的替代 View。')

  const replacementId = typeof fallback.id === 'string' ? fallback.id : ''
  const layout = config.hmi.layout
  const referenceCount = isRecord(layout)
    ? removeLayoutViewReferences(structuredClone(layout), viewId, replacementId)
    : 0
  const [removedView] = views.splice(index, 1)
  if (isRecord(layout)) {
    removeLayoutViewReferences(layout, viewId, replacementId)
  }
  return { deleted: true, removedView, fallbackView: fallback, referenceCount }
}
