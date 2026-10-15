export function findSvgLayer(doc: XMLDocument): Element | null {
  const root = doc.documentElement
  if (!root) return null

  const groups = Array.from(root.children).filter((node) => node.localName === 'g')
  for (const group of groups) {
    const titles = Array.from(group.getElementsByTagName('title'))
    if (titles.some((title) => title.textContent === 'Layer 1')) return group
  }
  return groups[0] ?? null
}
