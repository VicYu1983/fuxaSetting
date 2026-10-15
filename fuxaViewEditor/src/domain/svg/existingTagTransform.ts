export interface TagPosition {
  x: number
  y: number
}

export function existingTagTransform(
  original: TagPosition,
  target: TagPosition,
): string {
  const dx = target.x - original.x
  const dy = target.y - original.y
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return ''
  return `translate(${Number(dx.toFixed(3))} ${Number(dy.toFixed(3))})`
}
