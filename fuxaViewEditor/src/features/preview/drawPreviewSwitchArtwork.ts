import type { FloorLayoutEntry } from '../../domain/layout/floorLayout'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

export function drawPreviewSwitchArtwork(
  layer: Element,
  placements: readonly FloorLayoutEntry[],
): void {
  for (const { component, placement } of placements) {
    if (component.managed === false || component.template !== 'switch') continue

    const { x, y } = placement.shape
    const doc = layer.ownerDocument
    const group = doc.createElementNS(SVG_NAMESPACE, 'g')
    group.setAttribute('data-preview-only', 'switch')
    group.setAttribute('aria-hidden', 'true')
    group.setAttribute('pointer-events', 'none')

    const track = doc.createElementNS(SVG_NAMESPACE, 'rect')
    track.setAttribute('x', String(x + 9))
    track.setAttribute('y', String(y + 7))
    track.setAttribute('width', '32')
    track.setAttribute('height', '14')
    track.setAttribute('rx', '7')
    track.setAttribute('fill', '#bdbdbd')

    const thumb = doc.createElementNS(SVG_NAMESPACE, 'circle')
    thumb.setAttribute('cx', String(x + 17))
    thumb.setAttribute('cy', String(y + 14))
    thumb.setAttribute('r', '8')
    thumb.setAttribute('fill', '#ffffff')
    thumb.setAttribute('stroke', '#777777')
    thumb.setAttribute('stroke-width', '1')

    group.appendChild(track)
    group.appendChild(thumb)
    layer.appendChild(group)
  }
}
