export type SortMode = 'relevance' | 'rating' | 'newest' | 'oldest' | 'title'

export type BookRating = {
  value: number
  count: number
  source: 'openlibrary'
}

export type LibraryPresence = {
  branch: string
  code: string
}

export type Book = {
  id: string
  finnaId: string
  title: string
  authors: string[]
  isbns: string[]
  languages: string[]
  publicationYear?: number
  subjects: string[]
  formats: string[]
  coverUrl?: string
  coverUrls: string[]
  rating?: BookRating
  branches: LibraryPresence[]
  pikiUrl: string
}

export type BookDetails = Book & {
  description?: string
  contents: string[]
  physicalDescriptions: string[]
  publicationInfo: string[]
  publishers: string[]
  series: string[]
  catalogueLibraries: LibraryPresence[]
}

export type BookSearchFilters = {
  query: string
  language: string
  branchCode: string
  minRating: number
  sort: SortMode
}

export type SearchState = {
  loading: boolean
  error?: string
  total: number
  books: Book[]
}
