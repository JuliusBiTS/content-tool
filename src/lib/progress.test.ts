import { describe, expect, it } from 'vitest'
import {
  absoluteToSeasonEpisode,
  isComplete,
  nextActionLabel,
  positionLabel,
  progressFraction,
  stepSize,
} from './progress'
import type { Item } from './types'

const base = (over: Partial<Item>): Item => ({
  id: 'x',
  user_id: 'u',
  kind: 'series',
  title: 'T',
  sort_title: 't',
  poster_url: null,
  backdrop_url: null,
  source: 'manual',
  source_id: null,
  status: 'watching',
  rating: null,
  current_position: 0,
  total_units: null,
  metadata: {},
  started_at: null,
  finished_at: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  ...over,
})

describe('absoluteToSeasonEpisode', () => {
  const item = base({
    metadata: {
      seasons: [
        { number: 1, name: 'S1', episodeCount: 9 },
        { number: 2, name: 'S2', episodeCount: 10 },
      ],
    },
  })
  it('maps within season 1', () => {
    expect(absoluteToSeasonEpisode(item, 4)).toEqual({ season: 1, episode: 4 })
  })
  it('rolls into season 2', () => {
    expect(absoluteToSeasonEpisode(item, 12)).toEqual({ season: 2, episode: 3 })
  })
  it('clamps past the end', () => {
    expect(absoluteToSeasonEpisode(item, 999)).toEqual({ season: 2, episode: 10 })
  })
})

describe('positionLabel', () => {
  it('series with seasons → SxEy', () => {
    const i = base({
      current_position: 12,
      metadata: {
        seasons: [
          { number: 1, name: 'S1', episodeCount: 9 },
          { number: 2, name: 'S2', episodeCount: 10 },
        ],
      },
    })
    expect(positionLabel(i)).toBe('S2 E3')
  })
  it('anime absolute', () => {
    const i = base({ kind: 'anime', current_position: 137, metadata: { absoluteNumbering: true } })
    expect(positionLabel(i)).toBe('Folge 137')
  })
  it('manga chapters', () => {
    const i = base({ kind: 'manga', current_position: 364, total_units: 500 })
    expect(positionLabel(i)).toBe('Kap. 364 / 500')
  })
  it('done movie', () => {
    const i = base({ kind: 'movie', status: 'done', current_position: 1, total_units: 120 })
    expect(positionLabel(i)).toBe('Gesehen')
  })
})

describe('nextActionLabel', () => {
  it('manga', () => {
    expect(nextActionLabel(base({ kind: 'manga', current_position: 10 }))).toBe('Kapitel 11')
  })
  it('book', () => {
    expect(nextActionLabel(base({ kind: 'book', current_position: 40 }))).toBe('+10 Seiten')
  })
})

describe('stepSize / completion', () => {
  it('book steps by 10', () => {
    expect(stepSize(base({ kind: 'book' }))).toBe(10)
  })
  it('isComplete against episode total', () => {
    const i = base({
      metadata: { seasons: [{ number: 1, name: 'S1', episodeCount: 8 }] },
    })
    expect(isComplete(i, 8)).toBe(true)
    expect(isComplete(i, 7)).toBe(false)
  })
  it('progressFraction clamps 0..1', () => {
    expect(progressFraction(base({ kind: 'book', current_position: 600, total_units: 480 }))).toBe(1)
    expect(progressFraction(base({ kind: 'book', current_position: 0, total_units: 0 }))).toBeNull()
  })
})
