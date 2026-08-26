// Supabase Edge Function: proxies TMDB so the API token never reaches the client.
// Deploy:  supabase functions deploy tmdb-search
// Secret:  supabase secrets set TMDB_TOKEN=<your TMDB v4 Read Access Token>

const TMDB = 'https://api.themoviedb.org/3'
const LANG = 'de-DE'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function tmdb(path: string): Promise<unknown> {
  const token = Deno.env.get('TMDB_TOKEN')
  if (!token) throw new Error('TMDB_TOKEN not configured')
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${TMDB}${path}${sep}language=${LANG}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { mode, q, type, id } = await req.json()

    if (mode === 'search') {
      if (!q || String(q).trim().length < 2) return json({ results: [] })
      const data = await tmdb(
        `/search/multi?query=${encodeURIComponent(String(q))}&include_adult=false&page=1`,
      )
      return json(data)
    }

    if (mode === 'detail') {
      if (type !== 'tv' && type !== 'movie') return json({ error: 'bad type' }, 400)
      const data = await tmdb(`/${type}/${encodeURIComponent(String(id))}`)
      return json(data)
    }

    return json({ error: 'unknown mode' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500)
  }
})
