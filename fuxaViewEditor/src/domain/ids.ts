export interface RandomValuesProvider {
  getRandomValues(bytes: Uint8Array): Uint8Array
}

export function generateId(
  prefix: string,
  usedIds: Set<string>,
  cryptoProvider: RandomValuesProvider,
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(8))
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    const id = `${prefix}_${hex.slice(0, 4).join('')}-${hex.slice(4).join('')}`
    if (!usedIds.has(id)) {
      usedIds.add(id)
      return id
    }
  }
  throw new Error('無法產生唯一元件 ID。')
}
