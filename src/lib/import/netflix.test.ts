import { describe, expect, it } from 'vitest'
import {
  groupNetflix,
  inferDateOrder,
  parseNetflixCsv,
  parseNetflixDate,
  parseNetflixTitle,
  resolveProgress,
} from './netflix'

describe('parseNetflixTitle', () => {
  it('splits show / season / episode (English)', () => {
    expect(parseNetflixTitle('Severance: Season 2: Hello, Ms. Cobel')).toEqual({
      kind: 'episode',
      show: 'Severance',
      season: 2,
      episodeTitle: 'Hello, Ms. Cobel',
      epNumber: null,
    })
  })

  it('understands German labels and show names with colons', () => {
    expect(parseNetflixTitle('Dark: Staffel 1: Geheimnisse')).toMatchObject({
      show: 'Dark',
      season: 1,
      episodeTitle: 'Geheimnisse',
    })
    expect(parseNetflixTitle('Star Trek: Strange New Worlds: Staffel 2: Lost in Translation')).toMatchObject({
      show: 'Star Trek: Strange New Worlds',
      season: 2,
    })
  })

  it('maps "Part N" (split seasons) and limited series', () => {
    expect(parseNetflixTitle('Haus des Geldes: Teil 5: Episode 3')).toMatchObject({
      show: 'Haus des Geldes',
      season: 5,
      epNumber: 3,
    })
    expect(parseNetflixTitle('Beef: Limited Series: Figures of Light')).toMatchObject({
      show: 'Beef',
      season: 1,
      episodeTitle: 'Figures of Light',
    })
    expect(parseNetflixTitle('Adolescence: Miniserie: Folge 2')).toMatchObject({ season: 1, epNumber: 2 })
  })

  it('treats titles without a season marker — or a marker with no episode — as films', () => {
    expect(parseNetflixTitle('Dune: Part Two')).toEqual({ kind: 'movie', title: 'Dune: Part Two' })
    expect(parseNetflixTitle('Kill Bill: Vol. 1')).toEqual({ kind: 'movie', title: 'Kill Bill: Vol. 1' })
    expect(parseNetflixTitle('Roma')).toEqual({ kind: 'movie', title: 'Roma' })
  })
})

describe('dates', () => {
  it('infers day-first vs month-first from the data itself', () => {
    expect(inferDateOrder(['13/10/26', '02/03/26'])).toBe('DMY')
    expect(inferDateOrder(['10/13/26', '03/02/26'])).toBe('MDY')
    expect(inferDateOrder(['03/02/26'], 'MDY')).toBe('MDY') // ambiguous → fallback
    expect(inferDateOrder(['2026-10-13'])).toBe('YMD')
  })

  it('normalises every format to YYYY-MM-DD', () => {
    expect(parseNetflixDate('13.10.2026', 'DMY')).toBe('2026-10-13')
    expect(parseNetflixDate('13/10/26', 'DMY')).toBe('2026-10-13')
    expect(parseNetflixDate('10/13/26', 'MDY')).toBe('2026-10-13')
    expect(parseNetflixDate('2026-10-13', 'DMY')).toBe('2026-10-13')
    expect(parseNetflixDate('nonsense', 'DMY')).toBeNull()
    expect(parseNetflixDate('31/31/26', 'DMY')).toBeNull()
  })
})

describe('parseNetflixCsv', () => {
  it('reads the simple "Alle herunterladen" export', () => {
    const csv = `Title,Date\n"Severance: Season 2: Hello, Ms. Cobel","13.10.2026"\n"Roma","01.09.2026"`
    const r = parseNetflixCsv(csv)
    expect(r.format).toBe('simple')
    expect(r.rows).toEqual([
      { title: 'Severance: Season 2: Hello, Ms. Cobel', date: '2026-10-13' },
      { title: 'Roma', date: '2026-09-01' },
    ])
  })

  it('reads the full export: filters trailers, tiny plays and keeps profiles', () => {
    const csv = [
      'Profile Name,Start Time,Duration,Attributes,Title,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country',
      'Julius,2026-10-13 18:00:00,00:50:12,,"Severance: Season 2: Hello, Ms. Cobel",,TV,00:50:12,Not latest view,DE',
      'Julius,2026-10-13 17:55:00,00:00:40,Autoplayed: user action: None;,"Dune: Part Two",,TV,00:00:40,x,DE',
      'Julius,2026-10-13 17:00:00,00:02:10,,"Severance: Season 2: Trailer",TRAILER,TV,00:02:10,x,DE',
      'Anna,2026-10-12 20:00:00,01:40:00,,"Roma",,TV,01:40:00,x,DE',
    ].join('\n')
    const r = parseNetflixCsv(csv)
    expect(r.format).toBe('full')
    expect(r.profiles.sort()).toEqual(['Anna', 'Julius'])
    expect(r.rows.map((x) => x.title)).toEqual(['Severance: Season 2: Hello, Ms. Cobel', 'Roma'])
  })
})

describe('groupNetflix', () => {
  it('groups episodes per show, dedupes rewatches (keeping the first date) and splits films', () => {
    const { shows, movies } = groupNetflix([
      { title: 'Severance: Season 1: Good News About Hell', date: '2026-10-02' },
      { title: 'Severance: Season 1: Good News About Hell', date: '2026-09-01' },
      { title: 'Severance: Season 1: Half Loop', date: '2026-09-02' },
      { title: 'Roma', date: '2026-08-01' },
      { title: 'Roma', date: '2026-08-05' },
    ])
    expect(shows).toHaveLength(1)
    expect(shows[0].title).toBe('Severance')
    expect(shows[0].entries).toHaveLength(2)
    expect(shows[0].entries.find((e) => e.episodeTitle.startsWith('Good'))!.date).toBe('2026-09-01')
    expect(shows[0].lastDate).toBe('2026-10-02')
    expect(movies).toEqual([{ title: 'Roma', date: '2026-08-01' }])
  })
})

describe('resolveProgress', () => {
  const seasons = [
    { number: 1, episodeCount: 9 },
    { number: 2, episodeCount: 10 },
  ]
  const s1 = [
    { number: 1, name: 'Good News About Hell' },
    { number: 2, name: 'Half Loop' },
    { number: 3, name: 'In Perpetuity' },
  ]
  const e = (season: number, title: string, date: string | null, epNumber: number | null = null) => ({
    season,
    episodeTitle: title,
    epNumber,
    date,
  })

  it('matches by episode title and counts across seasons', () => {
    const r = resolveProgress(
      [e(1, 'Good News About Hell', '2026-09-01'), e(1, 'Half Loop', '2026-09-02'), e(1, 'In Perpetuity', '2026-09-03')],
      seasons,
      new Map([[1, s1]]),
    )
    expect(r.position).toBe(3)
    expect(r.estimated).toBe(false)
    expect(r.steps).toEqual([
      { to: 1, date: '2026-09-01' },
      { to: 2, date: '2026-09-02' },
      { to: 3, date: '2026-09-03' },
    ])
  })

  it('offsets later seasons by the sizes of earlier ones', () => {
    const r = resolveProgress(
      [e(2, 'Hello', '2026-10-01', 2)], // "Folge 2" of season 2
      seasons,
      new Map(),
    )
    expect(r.position).toBe(9 + 2)
  })

  it('falls back to a count when episode titles do not match, and says so', () => {
    const r = resolveProgress(
      [e(1, 'Ganz anderer Titel A', '2026-09-01'), e(1, 'Ganz anderer Titel B', '2026-09-02')],
      seasons,
      new Map([[1, s1]]),
    )
    expect(r.position).toBe(2)
    expect(r.estimated).toBe(true)
  })

  it('dates the estimated final step with the LAST viewing day', () => {
    const r = resolveProgress(
      [e(1, 'Unbekannt A', '2026-10-10'), e(1, 'Unbekannt B', '2026-10-11')],
      seasons,
      new Map(),
    )
    expect(r.steps).toEqual([{ to: 2, date: '2026-10-11' }])
  })

  it('ignores seasons TMDB does not know', () => {
    const r = resolveProgress([e(7, 'X', '2026-09-01', 1)], seasons, new Map())
    expect(r.position).toBe(0)
    expect(r.steps).toEqual([])
  })

  it('never moves the history backwards if episodes were watched out of order', () => {
    const r = resolveProgress(
      [e(1, 'In Perpetuity', '2026-09-01'), e(1, 'Good News About Hell', '2026-09-02')],
      seasons,
      new Map([[1, s1]]),
    )
    expect(r.steps).toEqual([{ to: 3, date: '2026-09-01' }])
    expect(r.position).toBe(3)
  })
})
