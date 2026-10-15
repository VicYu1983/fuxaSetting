import { isRecord } from '../config/validateFuxaConfig'

export function hasViewShape(view: unknown): boolean {
  return isRecord(view)
    && typeof view.id === 'string'
    && isRecord(view.items)
    && typeof view.svgcontent === 'string'
}

export function removeLayoutViewReferences(
  layout: unknown,
  viewId: string,
  replacementViewId: string,
): number {
  let removed = 0

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const entry = value[index]
        if (isRecord(entry) && entry.view === viewId) {
          value.splice(index, 1)
          removed += 1
        } else {
          visit(entry)
        }
      }
      return
    }

    if (!isRecord(value)) return
    for (const [key, child] of Object.entries(value)) {
      if (key === 'view' && child === viewId) {
        delete value[key]
        removed += 1
      } else if (key !== 'start') {
        visit(child)
      }
    }
  }

  if (isRecord(layout) && layout.start === viewId) {
    layout.start = replacementViewId
    removed += 1
  }
  visit(layout)
  return removed
}
