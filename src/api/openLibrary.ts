import type { Book, BookRating } from '../types'

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

type OpenLibraryApiResponse = Partial<Book> & {
  description?: string
}

const CACHE_PREFIX = 'metso-openlibrary-v1:'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 14

export async function enrichBooksWithOpenLibrary(books: Book[]): Promise<Book[]> {
  const settled = await Promise.allSettled(books.map(enrichBookWithOpenLibrary))
  return books.map((book, index) => (settled[index].status === 'fulfilled' ? settled[index].value : book))
}

export async function enrichBookWithOpenLibrary(book: Book): Promise<Book> {
  const cacheKey = `${CACHE_PREFIX}${book.isbns[0] || book.title}:${book.publicationYear || ''}`
  const cached = readCache(cacheKey)
  if (cached) {
    return mergeEnrichment(book, cached)
  }

  const enrichment = book.isbns.length ? await byIsbn(book.isbns[0]) : await bySearch(book)
  if (enrichment) {
    writeCache(cacheKey, enrichment)
    return mergeEnrichment(book, enrichment)
  }

  return book
}

export async function getOpenLibraryDescription(isbn?: string): Promise<string | undefined> {
  if (!isbn) return undefined

  const enrichment = await fetchOpenLibraryApi({ isbn })
  if (enrichment !== undefined) return enrichment?.description

  const editionResponse = await fetch(`https://openlibrary.org/isbn/${isbn}.json`)
  if (!editionResponse.ok) return undefined

  const edition = (await editionResponse.json()) as EditionResponse
  const workKey = edition.works?.[0]?.key
  if (!workKey) return undefined

  const workResponse = await fetch(`https://openlibrary.org${workKey}.json`)
  if (!workResponse.ok) return undefined

  const work = (await workResponse.json()) as WorkResponse
  if (typeof work.description === 'string') return work.description
  return work.description?.value
}

async function byIsbn(isbn: string): Promise<Partial<Book> | undefined> {
  const enrichment = await fetchOpenLibraryApi({ isbn })
  if (enrichment !== undefined) return enrichment ?? undefined

  const response = await fetch(`https://openlibrary.org/isbn/${isbn}.json`)
  if (!response.ok) return undefined

  const edition = (await response.json()) as EditionResponse
  const workKey = edition.works?.[0]?.key
  const rating = workKey ? await getRating(workKey) : undefined
  const coverUrl = edition.covers?.[0] ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-M.jpg` : undefined

  return { rating, coverUrl, coverUrls: coverUrl ? [coverUrl] : undefined }
}

async function bySearch(book: Book): Promise<Partial<Book> | undefined> {
  const enrichment = await fetchOpenLibraryApi({ title: book.title, author: book.authors[0] })
  if (enrichment !== undefined) return enrichment ?? undefined

  const params = new URLSearchParams()
  params.set('title', book.title)
  if (book.authors[0]) params.set('author', book.authors[0])
  params.set('fields', 'key,cover_i,ratings_average,ratings_count')
  params.set('limit', '1')

  const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`)
  if (!response.ok) return undefined

  const result = (await response.json()) as SearchResponse
  const doc = result.docs?.[0]
  if (!doc) return undefined

  const coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined

  return {
    rating:
      doc.ratings_average && doc.ratings_count
        ? { value: doc.ratings_average, count: doc.ratings_count, source: 'openlibrary' }
        : undefined,
    coverUrl,
    coverUrls: coverUrl ? [coverUrl] : undefined,
  }
}

async function getRating(workKey: string): Promise<BookRating | undefined> {
  const response = await fetch(`https://openlibrary.org${workKey}/ratings.json`)
  if (!response.ok) return undefined

  const data = (await response.json()) as RatingsResponse
  const average = data.summary?.average
  const count = data.summary?.count
  if (!average || !count) return undefined

  return { value: average, count, source: 'openlibrary' }
}

async function fetchOpenLibraryApi(params: { author?: string; isbn?: string; title?: string }): Promise<OpenLibraryApiResponse | null | undefined> {
  const searchParams = new URLSearchParams()
  if (params.isbn) searchParams.set('isbn', params.isbn)
  if (params.title) searchParams.set('title', params.title)
  if (params.author) searchParams.set('author', params.author)

  try {
    const response = await fetch(`/api/openlibrary?${searchParams.toString()}`)
    if (response.status === 404) return undefined
    if (response.status === 204) return null
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return undefined

    return (await response.json()) as OpenLibraryApiResponse
  } catch {
    return undefined
  }
}

function mergeEnrichment(book: Book, enrichment: Partial<Book>): Book {
  const coverUrls = unique([...(book.coverUrls ?? []), book.coverUrl, ...(enrichment.coverUrls ?? []), enrichment.coverUrl])
  const openLibraryRating = enrichment.ratings?.openlibrary ?? enrichment.rating

  return {
    ...book,
    ratings: {
      ...book.ratings,
      ...enrichment.ratings,
      ...(openLibraryRating ? { openlibrary: openLibraryRating } : {}),
    },
    rating: chooseBestRating({
      ...book.ratings,
      ...enrichment.ratings,
      ...(openLibraryRating ? { openlibrary: openLibraryRating } : {}),
    }),
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

function readCache(key: string): Partial<Book> | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { expires: number; value: Partial<Book> }
    if (parsed.expires < Date.now()) {
      localStorage.removeItem(key)
      return undefined
    }
    return parsed.value
  } catch {
    return undefined
  }
}

function writeCache(key: string, value: Partial<Book>): void {
  try {
    localStorage.setItem(key, JSON.stringify({ expires: Date.now() + CACHE_TTL, value }))
  } catch {
    // Best-effort cache only.
  }
}
