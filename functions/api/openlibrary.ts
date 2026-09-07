type PagesContext = {
  request: Request
}

type EditionResponse = {
  works?: Array<{ key: string }>
  covers?: number[]
}

type WorkResponse = {
  description?: string | { value?: string }
}

type SearchDoc = {
  key?: string
  cover_i?: number
  ratings_average?: number
  ratings_count?: number
}

type SearchResponse = {
  docs?: SearchDoc[]
}

type RatingsResponse = {
  summary?: {
    average?: number
    count?: number
  }
}

type OpenLibraryResponse = {
  rating?: {
    value: number
    count: number
    source: 'openlibrary'
  }
  coverUrl?: string
  coverUrls?: string[]
  description?: string
}

const OPEN_LIBRARY_BASE = 'https://openlibrary.org'
const OPEN_LIBRARY_COVERS_BASE = 'https://covers.openlibrary.org'

export async function onRequestGet({ request }: PagesContext): Promise<Response> {
  const url = new URL(request.url)
  const isbn = normalizeIsbn(url.searchParams.get('isbn') ?? undefined)
  const title = url.searchParams.get('title')?.trim()
  const author = url.searchParams.get('author')?.trim()

  if (!isbn && !title) return Response.json({ error: 'ISBN or title is required' }, { status: 400 })

  try {
    const enrichment = isbn ? await byIsbn(isbn) : await bySearch(title ?? '', author)
    if (!enrichment) return emptyResponse()

    return Response.json(enrichment, {
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return emptyResponse()
  }
}

async function byIsbn(isbn: string): Promise<OpenLibraryResponse | undefined> {
  const response = await fetch(`${OPEN_LIBRARY_BASE}/isbn/${isbn}.json`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return undefined

  const edition = (await response.json()) as EditionResponse
  const workKey = edition.works?.[0]?.key
  const rating = workKey ? await getRating(workKey) : undefined
  const description = workKey ? await getDescription(workKey) : undefined
  const coverUrl = edition.covers?.[0] ? `${OPEN_LIBRARY_COVERS_BASE}/b/id/${edition.covers[0]}-M.jpg` : undefined

  return { rating, description, coverUrl, coverUrls: coverUrl ? [coverUrl] : undefined }
}

async function bySearch(title: string, author?: string): Promise<OpenLibraryResponse | undefined> {
  const params = new URLSearchParams()
  params.set('title', title)
  if (author) params.set('author', author)
  params.set('fields', 'key,cover_i,ratings_average,ratings_count')
  params.set('limit', '1')

  const response = await fetch(`${OPEN_LIBRARY_BASE}/search.json?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return undefined

  const result = (await response.json()) as SearchResponse
  const doc = result.docs?.[0]
  if (!doc) return undefined

  const coverUrl = doc.cover_i ? `${OPEN_LIBRARY_COVERS_BASE}/b/id/${doc.cover_i}-M.jpg` : undefined
  const rating =
    doc.ratings_average && doc.ratings_count
      ? { value: doc.ratings_average, count: doc.ratings_count, source: 'openlibrary' as const }
      : undefined

  return { rating, coverUrl, coverUrls: coverUrl ? [coverUrl] : undefined }
}

async function getRating(workKey: string): Promise<OpenLibraryResponse['rating']> {
  const response = await fetch(`${OPEN_LIBRARY_BASE}${workKey}/ratings.json`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return undefined

  const data = (await response.json()) as RatingsResponse
  const average = data.summary?.average
  const count = data.summary?.count
  if (!average || !count) return undefined

  return { value: average, count, source: 'openlibrary' }
}

async function getDescription(workKey: string): Promise<string | undefined> {
  const response = await fetch(`${OPEN_LIBRARY_BASE}${workKey}.json`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return undefined

  const work = (await response.json()) as WorkResponse
  const description = typeof work.description === 'string' ? work.description : work.description?.value
  return cleanText(description)
}

function normalizeIsbn(value?: string): string | undefined {
  const normalized = value?.replace(/[-\s]/g, '').toUpperCase()
  if (!normalized || (normalized.length !== 10 && normalized.length !== 13)) return undefined
  if (!/^(?:97[89])?[0-9]{9}[0-9X]$/.test(normalized)) return undefined
  return normalized
}

function cleanText(value?: string): string | undefined {
  const cleaned = (value ?? '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return cleaned || undefined
}

function emptyResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'X-Metso-OpenLibrary-Status': 'not-found',
    },
  })
}
