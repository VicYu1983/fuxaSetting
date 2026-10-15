const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/'
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'

export function ensureXlinkNamespace(doc: XMLDocument): void {
  doc.documentElement?.setAttributeNS(XMLNS_NAMESPACE, 'xmlns:xlink', XLINK_NAMESPACE)
}
