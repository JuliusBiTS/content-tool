import 'fake-indexeddb/auto'

// jsdom-free: provide the tiny bits our libs touch
if (!('crypto' in globalThis)) {
  // Node 20+ has webcrypto
  ;(globalThis as { crypto?: Crypto }).crypto = (await import('node:crypto'))
    .webcrypto as unknown as Crypto
}
