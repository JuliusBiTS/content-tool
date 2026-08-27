import { describe, expect, it } from 'vitest'
import { computeInsights, formatHours } from './stats'
import type { Item, ProgressEvent } from './types'

const item = (over: Partial<Item>): Item =>
  ({
    id: 'i1',
    user_id: 'u',
    kind: 'series',
    title: 'T',
    sort_title: 't',
    poster_url: null,
    backdrop_url: null,
    source: 'tmdb',
    source_id: 'tv:1',
    status: 'watching',
    rating: null,
    current_position: 0,
    total_units: null,
    metadata: { runtimeMinutes: 30 },
    started_at: null,
    finished_at: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...over,
  }) as Item

const ev = (over: Partial<ProgressEvent>): ProgressEvent =>
  ({
    id: 'e' + Math.random(),
    user_id: 'u',
    item_id: 'i1',
    kind: 'progress',
    from_position: 0,
    to_position: 1,
    note: null,
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...over,
  }) as ProgressEvent

describe('computeInsights', () => {
  it('counts watch time from episode runtime × delta', () => {
    const items = [item({})]
    const events = [ev({ from_position: 0, to_position: 3 })] // 3 episodes × 30 min
    const ins = computeInsights(items, events)
    expect(ins.minutesTotal).toBe(90)
    expect(ins.minutesWindow(7)).toBe(90)
  })

  it('does not count pages/chapters as minutes', () => {
    const items = [item({ id: 'b', kind: 'book' })]
    const events = [ev({ item_id: 'b', from_position: 0, to_position: 50 })]
    const ins = computeInsights(items, events)
    expect(ins.minutesTotal).toBe(0)
    expect(ins.unitsWindow(7)).toBe(50)
  })

  it('builds a taste profile weighted by rating', () => {
    const items = [
      item({ status: 'done', rating: 10, metadata: { genres: ['Sci-Fi'] } }),
      item({ id: 'i2', status: 'watching', metadata: { genres: ['Sci-Fi', 'Drama'] } }),
    ]
    const ins = computeInsights(items, [])
    expect(ins.genres[0].name).toBe('Sci-Fi')
  })

  it('rating calibration needs a sample and compares to external', () => {
    const items = Array.from({ length: 5 }, (_, n) =>
      item({ id: 'i' + n, rating: 8, metadata: { externalRating: 7 } }),
    )
    const ins = computeInsights(items, [])
    expect(ins.calibration?.delta).toBe(1)
  })
})

describe('formatHours', () => {
  it('minutes under an hour', () => expect(formatHours(45)).toBe('45 Min'))
  it('hours with one decimal when small', () => expect(formatHours(150)).toBe('2.5 Std'))
  it('rounds large values', () => expect(formatHours(12345)).toBe('206 Std'))
})
