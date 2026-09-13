export type SortMode = 'relevance' | 'newest' | 'oldest' | 'title' | 'rating'

export type BookRating = {
  value: number
  count: number
  source: 'finna' | 'openlibrary' | 'hardcover' | 'fantlab'
  url?: string
}

export type RatingSource = BookRating['source']

export type LibraryPresence = {
  branch: string
  code: string
}

export type BookRecommendationStatus = {
  recommendersCount: number
  sourceUrl: string
}

export type Book = {
  id: string
  finnaId: string
  title: string
  authors: string[]
  isbns: string[]
  languages: string[]
  publicationYear?: number
  series: string[]
  subjects: string[]
  formats: string[]
  coverUrl?: string
  coverUrls: string[]
  description?: string
  ratings?: Partial<Record<RatingSource, BookRating>>
  rating?: BookRating
  topLoaned?: boolean
  recommended?: BookRecommendationStatus
  branches: LibraryPresence[]
  pikiUrl: string
}

export type BookDetails = Book & {
  classifications: string[]
  description?: string
  edition?: string
  genres: string[]
  contents: string[]
  physicalDescriptions: string[]
  publicationInfo: string[]
  publishers: string[]
  catalogueLibraries: LibraryPresence[]
}

export type BookSearchFilters = {
  query: string
  languageCodes: string[]
  genreValues: string[]
  branchCodes: string[]
  sort: SortMode
}

export type SearchState = {
  loading: boolean
  enriching: number
  error?: string
  total: number
  books: Book[]
}
