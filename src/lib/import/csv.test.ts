import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('parses a simple Letterboxd ratings export', () => {
    const csv = `Date,Name,Year,Letterboxd URI,Rating
2024-01-05,Dune: Part Two,2024,https://boxd.it/x,4.5`
    expect(parseCsv(csv)).toEqual([
      {
        Date: '2024-01-05',
        Name: 'Dune: Part Two',
        Year: '2024',
        'Letterboxd URI': 'https://boxd.it/x',
        Rating: '4.5',
      },
    ])
  })

  it('handles quoted fields with commas', () => {
    const csv = `Name,Note\n"Killers of the Flower Moon","great, long"`
    expect(parseCsv(csv)[0]).toEqual({
      Name: 'Killers of the Flower Moon',
      Note: 'great, long',
    })
  })

  it('handles escaped quotes and newlines inside a field', () => {
    const csv = `Name,Note\n"He said ""hi""","line1\nline2"`
    expect(parseCsv(csv)[0]).toEqual({
      Name: 'He said "hi"',
      Note: 'line1\nline2',
    })
  })

  it('strips a BOM and ignores blank trailing lines', () => {
    const csv = `﻿A,B\n1,2\n\n`
    expect(parseCsv(csv)).toEqual([{ A: '1', B: '2' }])
  })
})
