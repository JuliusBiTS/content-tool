import { db } from './db'

function download(name: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export async function exportJson(): Promise<void> {
  const [items, events, episodeNotes] = await Promise.all([
    db.items.toArray(),
    db.events.toArray(),
    db.episodeNotes.toArray(),
  ])
  download(
    `medialog-${stamp()}.json`,
    'application/json',
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        version: 1,
        items: items.filter((i) => !i.deleted_at),
        events,
        episodeNotes,
      },
      null,
      2,
    ),
  )
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCsv(): Promise<void> {
  const items = (await db.items.toArray()).filter((i) => !i.deleted_at)
  const cols = [
    'title',
    'kind',
    'status',
    'rating',
    'current_position',
    'total_units',
    'year',
    'genres',
    'started_at',
    'finished_at',
    'source',
    'source_id',
  ]
  const rows = items.map((i) =>
    [
      i.title,
      i.kind,
      i.status,
      i.rating != null ? (i.rating / 2).toFixed(1) : '',
      i.current_position,
      i.total_units ?? '',
      i.metadata.year ?? '',
      (i.metadata.genres ?? []).join('; '),
      i.started_at ?? '',
      i.finished_at ?? '',
      i.source,
      i.source_id ?? '',
    ]
      .map(csvCell)
      .join(','),
  )
  download(`medialog-${stamp()}.csv`, 'text/csv', [cols.join(','), ...rows].join('\n'))
}
