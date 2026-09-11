import type { Book, BookRating } from '../types'

type FantLabResponse = {
  rating?: {
    value: number
    count: number
    source: 'fantlab'
  }
  fantlabUrl?: string
}

const CACHE_PREFIX = 'metso-fantlab-v1:'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 14

export async function enrichBookWithFantLab(book: Book): Promise<Book> {
  const cacheKey = `${CACHE_PREFIX}${book.isbns[0] || book.title}:${book.authors[0] || ''}`
  const cached = readCache(cacheKey)
  if (cached !== undefined) return cached ? mergeEnrichment(book, cached) : book

  const enrichment = await fetchFantLabEnrichment(book)
  writeCache(cacheKey, enrichment ?? null)
  return enrichment ? mergeEnrichment(book, enrichment) : book
}

async function fetchFantLabEnrichment(book: Pick<Book, 'authors' | 'isbns' | 'title'>): Promise<FantLabResponse | undefined> {
  const params = new URLSearchParams()
  if (book.isbns[0]) params.set('isbn', book.isbns[0])
  params.set('title', book.title)
  if (book.authors[0]) params.set('author', book.authors[0])

  const response = await fetch(`/api/fantlab?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  })
  if (response.status === 204 || !response.ok) return undefined
  if (!response.headers.get('content-type')?.includes('application/json')) return undefined

  return (await response.json()) as FantLabResponse
}

function mergeEnrichment(book: Book, enrichment: FantLabResponse): Book {
  const ratings = {
    ...book.ratings,
    ...(book.rating && !book.ratings?.[book.rating.source] ? { [book.rating.source]: book.rating } : {}),
    ...(enrichment.rating ? { fantlab: { ...enrichment.rating, url: enrichment.fantlabUrl } } : {}),
  }

  return {
    ...book,
    ratings,
    rating: chooseBestRating(ratings),
  }
}

function chooseBestRating(ratings?: Book['ratings']): BookRating | undefined {
  return ratings?.openlibrary ?? ratings?.fantlab ?? ratings?.hardcover ?? ratings?.finna
}

function readCache(key: string): FantLabResponse | null | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { expires: number; value: FantLabResponse | null }
    if (parsed.expires < Date.now()) {
      localStorage.removeItem(key)
      return undefined
    }
    return parsed.value
  } catch {
    return undefined
  }
}

function writeCache(key: string, value: FantLabResponse | null): void {
  try {
    localStorage.setItem(key, JSON.stringify({ expires: Date.now() + CACHE_TTL, value }))
  } catch {
    // Best-effort cache only.
  }
}
