/** Run `fn` over `items` with at most `limit` in flight; `onTick` fires per finished item. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onTick: () => void = () => {},
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i], i)
      onTick()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
