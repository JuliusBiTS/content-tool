import { describe, expect, it } from 'vitest'
import { isTransportError } from './sync'

describe('isTransportError', () => {
  it('treats a fetch failure as transport (whole batch retries later)', () => {
    expect(isTransportError({ message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isTransportError({ message: 'network error' })).toBe(true)
  })

  it('treats a Postgres constraint violation as data-level (row is quarantined)', () => {
    expect(
      isTransportError({ code: '23514', message: 'new row violates check constraint' }),
    ).toBe(false)
  })

  it('treats an RLS / permission error as data-level', () => {
    expect(isTransportError({ code: '42501', message: 'permission denied' })).toBe(false)
  })

  it('unknown error with no code and no transport wording → data-level (never stalls)', () => {
    expect(isTransportError({ message: 'weird' })).toBe(false)
  })
})
