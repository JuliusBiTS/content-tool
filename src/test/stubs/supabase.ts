/** Fake `jsr:@supabase/supabase-js` for testing the edge function. */
export const fake = {
  subs: [] as Record<string, unknown>[],
  items: [] as Record<string, unknown>[],
  deleted: [] as unknown[],
  updates: [] as { payload: Record<string, unknown>; filters: unknown[] }[],
  reset() {
    this.subs = []
    this.items = []
    this.deleted = []
    this.updates = []
  },
}

export function createClient() {
  return {
    from(table: string) {
      let op: 'select' | 'delete' | 'update' = 'select'
      let payload: Record<string, unknown> = {}
      const filters: unknown[][] = []
      const b: Record<string, unknown> = {
        select: () => b,
        is: () => b,
        in: (c: string, v: unknown) => (filters.push(['in', c, v]), b),
        eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), b),
        delete: () => ((op = 'delete'), b),
        update: (p: Record<string, unknown>) => ((op = 'update'), (payload = p), b),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(res, rej),
      }
      function run() {
        if (op === 'select') {
          return { data: table === 'push_subscriptions' ? fake.subs : fake.items, error: null }
        }
        if (op === 'delete') fake.deleted.push(filters[0]?.[2])
        if (op === 'update') fake.updates.push({ payload, filters })
        return { data: null, error: null }
      }
      return b
    },
  }
}
