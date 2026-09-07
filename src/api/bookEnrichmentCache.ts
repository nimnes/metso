import type { Book, BookRating, RatingSource } from '../types'

type CachedBookEnrichment = {
  checkedSources: RatingSource[]
  coverUrls: string[]
  isbn: string
  ratings: Partial<Record<RatingSource, BookRating>>
  updatedAt: number
}

const CACHE_KEY = 'metso-book-enrichment-v1'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7
const MAX_CACHE_SIZE = 200
const SOURCE_CODES: Record<RatingSource, string> = {
  openlibrary: 'OL',
  hardcover: 'H',
  finna: 'FI',
}
const CODE_SOURCES: Record<string, RatingSource> = {
  OL: 'openlibrary',
  H: 'hardcover',
  FI: 'finna',
}

export function applyCachedBookEnrichment(book: Book): Book {
  const cached = findCachedBookEnrichment(book)
  if (!cached) return book

  const ratings = {
    ...cached.ratings,
    ...book.ratings,
  }
  const coverUrls = unique([...(book.coverUrls ?? []), book.coverUrl, ...cached.coverUrls])

  return {
    ...book,
    ratings,
    rating: chooseBestRating(ratings),
    coverUrl: coverUrls[0],
    coverUrls,
  }
}

export function hasCheckedRatingSource(book: Book, source: RatingSource): boolean {
  return findCachedBookEnrichment(book)?.checkedSources.includes(source) ?? false
}

export function rememberBookEnrichment(book: Book, checkedSource?: RatingSource): void {
  const isbn = getPrimaryIsbn(book)
  if (!isbn) return

  const entries = readCache()
  const previous = entries.find((entry) => entry.isbn === isbn)
  const ratings = {
    ...(previous?.ratings ?? {}),
    ...(book.ratings ?? {}),
    ...(book.rating ? { [book.rating.source]: book.rating } : {}),
  }
  const checkedSources = unique([...(previous?.checkedSources ?? []), checkedSource])
  const coverUrls = unique([...(previous?.coverUrls ?? []), ...(book.coverUrls ?? []), book.coverUrl])
  const nextEntry: CachedBookEnrichment = {
    isbn,
    ratings,
    checkedSources,
    coverUrls,
    updatedAt: Date.now(),
  }
  const nextEntries = [nextEntry, ...entries.filter((entry) => entry.isbn !== isbn)].slice(0, MAX_CACHE_SIZE)
  writeCache(nextEntries)
}

function findCachedBookEnrichment(book: Book): CachedBookEnrichment | undefined {
  const isbns = getBookIsbns(book)
  if (!isbns.length) return undefined

  return readCache().find((entry) => isbns.includes(entry.isbn))
}

function getPrimaryIsbn(book: Pick<Book, 'isbns'>): string | undefined {
  return getBookIsbns(book)[0]
}

function getBookIsbns(book: Pick<Book, 'isbns'>): string[] {
  return unique(book.isbns.map(normalizeIsbn))
}

function normalizeIsbn(value?: string): string | undefined {
  const normalized = value?.replace(/[-\s]/g, '').toUpperCase()
  if (!normalized || (normalized.length !== 10 && normalized.length !== 13)) return undefined
  if (!/^(?:97[89])?[0-9]{9}[0-9X]$/.test(normalized)) return undefined
  return normalized
}

function readCache(): CachedBookEnrichment[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []

    const lines = raw.split('\n')
    const entries = lines
      .map(parseEntry)
      .filter((entry): entry is CachedBookEnrichment => Boolean(entry))
      .filter((entry) => Date.now() - entry.updatedAt <= CACHE_TTL)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_CACHE_SIZE)

    if (entries.length !== lines.length) writeCache(entries)

    return entries
  } catch {
    return []
  }
}

function writeCache(entries: CachedBookEnrichment[]): void {
  try {
    localStorage.setItem(CACHE_KEY, entries.map(formatEntry).join('\n'))
  } catch {
    // Best-effort cache only.
  }
}

function parseEntry(value: string): CachedBookEnrichment | undefined {
  const [isbn, updatedAtRaw, payload = ''] = value.split('|')
  const updatedAt = Number(updatedAtRaw)
  if (!isbn || !Number.isFinite(updatedAt)) return undefined

  const ratings: Partial<Record<RatingSource, BookRating>> = {}
  const checkedSources: RatingSource[] = []
  const coverUrls: string[] = []

  payload.split(';').forEach((part) => {
    const [code, rawValue = ''] = part.split(':')
    if (code === 'C') {
      coverUrls.push(...rawValue.split(',').map(decodeValue).filter(Boolean))
      return
    }

    const source = CODE_SOURCES[code]
    if (!source) return

    checkedSources.push(source)
    if (rawValue === '-') return

    const [ratingValue, countValue] = rawValue.split(',')
    const rating = Number(ratingValue)
    const count = Number(countValue)
    if (!Number.isFinite(rating) || !Number.isFinite(count)) return

    ratings[source] = { value: rating, count, source }
  })

  return {
    isbn,
    updatedAt,
    ratings,
    checkedSources: unique(checkedSources),
    coverUrls: unique(coverUrls),
  }
}

function formatEntry(entry: CachedBookEnrichment): string {
  const parts = (Object.keys(SOURCE_CODES) as RatingSource[]).flatMap((source) => {
    if (!entry.checkedSources.includes(source) && !entry.ratings[source]) return []

    const rating = entry.ratings[source]
    const value = rating ? `${trimNumber(rating.value)},${Math.round(rating.count)}` : '-'
    return `${SOURCE_CODES[source]}:${value}`
  })

  if (entry.coverUrls.length) {
    parts.push(`C:${entry.coverUrls.map(encodeURIComponent).join(',')}`)
  }

  return `${entry.isbn}|${entry.updatedAt}|${parts.join(';')}`
}

function chooseBestRating(ratings?: Book['ratings']): BookRating | undefined {
  return ratings?.openlibrary ?? ratings?.hardcover ?? ratings?.finna
}

function trimNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function decodeValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

function unique<T>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[]))
}
