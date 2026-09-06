import type { Book, BookRecommendationStatus } from '../types'

type MostRecommendedBookResult = {
  title?: string
  author?: string
  recommendersCount?: number
}

type MostRecommendedBooksResponse = {
  url?: string
  results?: MostRecommendedBookResult[]
}

const CACHE_PREFIX = 'metso-most-recommended-v1:'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 14

export async function enrichBookWithMostRecommended(book: Book): Promise<Book> {
  const cacheKey = `${CACHE_PREFIX}${book.title}:${book.authors[0] || ''}`
  const cached = readCache(cacheKey)
  if (cached !== undefined) return mergeRecommendation(book, cached ?? undefined)

  const recommendation = await fetchRecommendation(book)
  writeCache(cacheKey, recommendation)
  return mergeRecommendation(book, recommendation)
}

async function fetchRecommendation(book: Book): Promise<BookRecommendationStatus | undefined> {
  const params = new URLSearchParams({ q: book.title })
  const response = await fetch(`https://mostrecommendedbooks.com/api/v1/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return undefined

  const data = (await response.json()) as MostRecommendedBooksResponse
  const match = data.results?.find((result) => matchesBook(book, result))
  if (!match?.recommendersCount) return undefined

  return {
    recommendersCount: match.recommendersCount,
    sourceUrl: data.url || `https://mostrecommendedbooks.com/search?q=${encodeURIComponent(book.title)}`,
  }
}

function matchesBook(book: Book, result: MostRecommendedBookResult): boolean {
  if (normalizeText(book.title) !== normalizeText(result.title)) return false

  const bookAuthor = book.authors[0]
  if (!bookAuthor || !result.author) return true

  return authorSignature(bookAuthor) === authorSignature(result.author)
}

function mergeRecommendation(book: Book, recommendation: BookRecommendationStatus | undefined): Book {
  return recommendation ? { ...book, recommended: recommendation } : book
}

function normalizeText(value?: string): string {
  return (value ?? '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function authorSignature(value: string): string {
  return normalizeText(value).split(' ').filter(Boolean).sort().join(' ')
}

function readCache(key: string): BookRecommendationStatus | undefined | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { expires: number; value: BookRecommendationStatus | null }
    if (parsed.expires < Date.now()) {
      localStorage.removeItem(key)
      return undefined
    }
    return parsed.value
  } catch {
    return undefined
  }
}

function writeCache(key: string, value: BookRecommendationStatus | undefined): void {
  try {
    localStorage.setItem(key, JSON.stringify({ expires: Date.now() + CACHE_TTL, value: value ?? null }))
  } catch {
    // Best-effort cache only.
  }
}
