import type { Book, BookRating } from '../types'

type HardcoverResponse = {
  rating?: {
    value: number
    count: number
    source: 'hardcover'
  }
  coverUrl?: string
  description?: string
}

const CACHE_PREFIX = 'metso-hardcover-v2:'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 14

export async function enrichBooksWithHardcover(books: Book[]): Promise<Book[]> {
  const enriched: Book[] = []

  for (const book of books) {
    try {
      enriched.push(await enrichBookWithHardcover(book))
    } catch {
      enriched.push(book)
    }
  }

  return enriched
}

export async function enrichBookWithHardcover(book: Book): Promise<Book> {
  const cacheKey = `${CACHE_PREFIX}${book.isbns[0] || book.title}:${book.publicationYear || ''}`
  const cached = readCache(cacheKey)
  if (cached) return mergeEnrichment(book, cached)

  const enrichment = await fetchHardcoverEnrichment(book)
  if (!enrichment) return book

  writeCache(cacheKey, enrichment)
  return mergeEnrichment(book, enrichment)
}

export async function getHardcoverDescription(book: Pick<Book, 'authors' | 'isbns' | 'publicationYear' | 'title'>): Promise<string | undefined> {
  const enrichment = await fetchHardcoverEnrichment(book)
  return cleanText(enrichment?.description)
}

async function fetchHardcoverEnrichment(book: Pick<Book, 'authors' | 'isbns' | 'publicationYear' | 'title'>): Promise<HardcoverResponse | undefined> {
  const cacheKey = `${CACHE_PREFIX}${book.isbns[0] || book.title}:${book.publicationYear || ''}`
  const cached = readCache(cacheKey)
  if (cached) return cached

  const params = new URLSearchParams()
  if (book.isbns[0]) params.set('isbn', book.isbns[0])
  params.set('title', book.title)
  if (book.authors[0]) params.set('author', book.authors[0])

  const response = await fetch(`/api/hardcover?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  })
  if (response.status === 204 || !response.ok) return undefined

  if (!response.headers.get('content-type')?.includes('application/json')) return undefined

  const enrichment = (await response.json()) as HardcoverResponse
  writeCache(cacheKey, enrichment)
  return enrichment
}

function mergeEnrichment(book: Book, enrichment: HardcoverResponse): Book {
  const coverUrls = unique([...(book.coverUrls ?? []), book.coverUrl, enrichment.coverUrl])
  const ratings = {
    ...book.ratings,
    ...(book.rating && !book.ratings?.[book.rating.source] ? { [book.rating.source]: book.rating } : {}),
    ...(enrichment.rating ? { hardcover: enrichment.rating } : {}),
  }

  return {
    ...book,
    ratings,
    rating: chooseBestRating(ratings),
    coverUrl: coverUrls[0],
    coverUrls,
  }
}

function chooseBestRating(ratings?: Book['ratings']): BookRating | undefined {
  return ratings?.openlibrary ?? ratings?.fantlab ?? ratings?.hardcover ?? ratings?.finna
}

function unique<T>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[]))
}

function cleanText(value?: string): string | undefined {
  const cleaned = (value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return cleaned || undefined
}

function readCache(key: string): HardcoverResponse | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { expires: number; value: HardcoverResponse }
    if (parsed.expires < Date.now()) {
      localStorage.removeItem(key)
      return undefined
    }
    return parsed.value
  } catch {
    return undefined
  }
}

function writeCache(key: string, value: HardcoverResponse): void {
  try {
    localStorage.setItem(key, JSON.stringify({ expires: Date.now() + CACHE_TTL, value }))
  } catch {
    // Best-effort cache only.
  }
}
