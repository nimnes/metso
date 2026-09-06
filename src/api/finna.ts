import { TAMPERE_CITY_CODE, TAMPERE_HOLDING_LABELS } from '../data/tampereBranches'
import { GENRE_OPTIONS } from '../data/genreOptions'
import type { Book, BookDetails, BookSearchFilters, LibraryPresence } from '../types'

const FINNA_API_BASE = 'https://api.finna.fi/v1'
const PIKI_BASE = 'https://piki.finna.fi'
export const FINNA_PAGE_SIZE = 20

type FinnaTranslatedField = {
  value: string
  translated: string
}

type FinnaAuthorBuckets = Record<string, Record<string, { role?: string[] }>>

type FinnaRecord = {
  id: string
  title?: string
  authors?: FinnaAuthorBuckets
  nonPresenterAuthors?: Array<{ name: string; role?: string }>
  year?: string
  languages?: string[]
  subjects?: string[][]
  formats?: FinnaTranslatedField[]
  images?: string[]
  isbns?: string[]
  cleanIsbn?: string
  buildings?: FinnaTranslatedField[]
  recordPage?: string
  summary?: string[]
  contents?: string[]
  physicalDescriptions?: string[]
  publicationInfo?: string[]
  publishers?: string[]
  series?: Array<{ name?: string; additional?: string }>
  rawData?: {
    classification_txt_mv?: string[]
    edition?: string
    genre?: string[]
    genre_facet?: string[]
    holdings_txtP_mv?: string[]
  }
}

type FinnaSearchResponse = {
  status: 'OK' | 'ERROR'
  statusMessage?: string
  resultCount?: number
  records?: FinnaRecord[]
}

const REQUESTED_FIELDS = [
  'id',
  'title',
  'authors',
  'nonPresenterAuthors',
  'year',
  'languages',
  'subjects',
  'formats',
  'images',
  'isbns',
  'cleanIsbn',
  'buildings',
  'recordPage',
  'rawData',
]

const DETAIL_FIELDS = [
  ...REQUESTED_FIELDS,
  'summary',
  'contents',
  'physicalDescriptions',
  'publicationInfo',
  'publishers',
  'series',
]

export async function searchFinna(filters: BookSearchFilters, page = 1): Promise<{ total: number; books: Book[] }> {
  const params = new URLSearchParams()
  params.set('lookfor', filters.query.trim() || '*')
  params.set('type', 'AllFields')
  params.set('sort', sortToFinna(filters.sort))
  params.set('limit', String(FINNA_PAGE_SIZE))
  params.set('page', String(page))

  REQUESTED_FIELDS.forEach((field) => params.append('field[]', field))
  params.append('filter[]', `building:"${TAMPERE_CITY_CODE}"`)
  filters.branchCodes
    .filter((branchCode) => branchCode.startsWith('holdings:'))
    .forEach((branchCode) => {
      params.append('filter[]', `~holdings_txtP_mv:"${branchCode.replace('holdings:', '')}"`)
    })
  params.append('filter[]', 'format:"0/Book/"')

  filters.languageCodes.forEach((language) => {
    params.append('filter[]', `~language:"${language}"`)
  })

  filters.genreValues
    .flatMap((genreValue) => GENRE_OPTIONS.find((option) => option.value === genreValue)?.finnaValues ?? [])
    .forEach((value) => {
      params.append('filter[]', `~genre_facet:"${value}"`)
    })

  const response = await fetch(`${FINNA_API_BASE}/search?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Finna request failed with ${response.status}`)
  }

  const data = (await response.json()) as FinnaSearchResponse
  if (data.status !== 'OK') {
    throw new Error(data.statusMessage || 'Finna returned an error')
  }

  return {
    total: data.resultCount ?? 0,
    books: (data.records ?? []).map(normalizeFinnaBook),
  }
}

export async function getFinnaBookDetails(finnaId: string): Promise<BookDetails> {
  const params = new URLSearchParams()
  params.set('id', finnaId)
  DETAIL_FIELDS.forEach((field) => params.append('field[]', field))

  const response = await fetch(`${FINNA_API_BASE}/record?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Finna detail request failed with ${response.status}`)
  }

  const data = (await response.json()) as FinnaSearchResponse
  if (data.status !== 'OK' || !data.records?.[0]) {
    throw new Error(data.statusMessage || 'Book details were not found')
  }

  return normalizeFinnaBookDetails(data.records[0])
}

function normalizeFinnaBook(record: FinnaRecord): Book {
  const isbns = normalizeIsbns([...(record.isbns ?? []), record.cleanIsbn].filter(Boolean) as string[])
  const coverUrls = unique([
    ...(record.images ?? []).map((image) => `${PIKI_BASE}${image}`),
    ...isbns.map(openLibraryCoverUrl).filter(Boolean),
  ] as string[])

  return {
    id: record.id,
    finnaId: record.id,
    title: record.title || 'Untitled',
    authors: normalizeAuthors(record),
    isbns,
    languages: record.languages ?? [],
    publicationYear: record.year ? Number.parseInt(record.year, 10) || undefined : undefined,
    subjects: normalizeSubjects(record.subjects),
    formats: (record.formats ?? []).map((format) => format.translated),
    coverUrl: coverUrls[0],
    coverUrls,
    branches: normalizeBranches(record),
    pikiUrl: record.recordPage ? `${PIKI_BASE}${record.recordPage}` : `${PIKI_BASE}/Record/${record.id}`,
  }
}

function normalizeFinnaBookDetails(record: FinnaRecord): BookDetails {
  const book = normalizeFinnaBook(record)

  return {
    ...book,
    classifications: normalizeClassifications(record.rawData?.classification_txt_mv),
    description: cleanText(record.summary?.[0]),
    edition: cleanText(record.rawData?.edition),
    genres: uniqueNormalized([...(record.rawData?.genre_facet ?? []), ...(record.rawData?.genre ?? [])].map(cleanText)).filter(Boolean),
    contents: (record.contents ?? []).map(cleanText).filter(Boolean),
    physicalDescriptions: record.physicalDescriptions ?? [],
    publicationInfo: record.publicationInfo ?? [],
    publishers: record.publishers ?? [],
    series: (record.series ?? [])
      .map(normalizeSeries)
      .filter(Boolean)
      .filter(uniqueByNormalizedValue),
    catalogueLibraries: normalizeCatalogueLibraries(record),
  }
}

function normalizeClassifications(classifications?: string[]): string[] {
  return unique(
    (classifications ?? []).map((classification) => classification.replace(/^ykl\s+/i, '').trim()).filter(Boolean),
  )
}

function normalizeSeries(series: { name?: string; additional?: string }): string {
  const value = [series.name, series.additional].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return value.replace(/\s+\]/g, ']').replace(/\s+([.,;:])/g, '$1')
}

function normalizeAuthors(record: FinnaRecord): string[] {
  if (record.nonPresenterAuthors?.length) {
    return unique(record.nonPresenterAuthors.map((author) => cleanAuthorName(author.name))).slice(0, 4)
  }

  const buckets = record.authors ?? {}
  return unique(
    Object.values(buckets)
      .flatMap((bucket) => Object.keys(bucket))
      .map(cleanAuthorName),
  ).slice(0, 4)
}

function cleanAuthorName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, '').replace(/,\s*(kirjoittaja|kääntäjä).*$/i, '').trim()
}

function normalizeSubjects(subjects?: string[][]): string[] {
  return unique((subjects ?? []).flatMap((subject) => subject.map((part) => part.replace(/[,.]$/g, '').trim()))).slice(0, 8)
}

function normalizeBranches(record: FinnaRecord): LibraryPresence[] {
  const holdingBranches = normalizeTampereHoldingBranches(record.rawData?.holdings_txtP_mv)
  if (holdingBranches.length) return holdingBranches

  return (record.buildings ?? [])
    .filter((building) => building.value.startsWith('2/Piki/1/'))
    .map((building) => ({ code: building.value, branch: building.translated || 'Tampere' }))
}

function normalizeCatalogueLibraries(record: FinnaRecord): LibraryPresence[] {
  return normalizeBranches(record)
}

function normalizeTampereHoldingBranches(holdings?: string[]): LibraryPresence[] {
  const branches = (holdings ?? [])
    .map((holding) => holding.trim())
    .filter((holding) => TAMPERE_HOLDING_LABELS.has(holding))
    .map((holding) => ({
      code: holding,
      branch: TAMPERE_HOLDING_LABELS.get(holding) ?? holding,
    }))

  return Array.from(new Map(branches.map((branch) => [branch.code, branch])).values())
}

function cleanText(value?: string): string {
  return (value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function normalizeIsbns(values: string[]): string[] {
  return unique(
    values
      .map((value) => value.match(/(?:97[89][-\s]?)?\d[-\d\s]{8,}[\dXx]/)?.[0] ?? '')
      .map((value) => value.replace(/[-\s]/g, '').toUpperCase())
      .filter((value) => value.length === 10 || value.length === 13),
  )
}

function openLibraryCoverUrl(isbn?: string): string | undefined {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : undefined
}

function sortToFinna(sort: string): string {
  if (sort === 'newest') return 'main_date_str desc'
  if (sort === 'oldest') return 'main_date_str asc'
  if (sort === 'title') return 'title'
  return 'relevance'
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>()

  return values.filter((value) => {
    const normalized = value.toLocaleLowerCase().trim()
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function uniqueByNormalizedValue(value: string, index: number, values: string[]): boolean {
  const normalized = value.toLocaleLowerCase().replace(/[.,;:\s]+$/g, '')
  return values.findIndex((item) => item.toLocaleLowerCase().replace(/[.,;:\s]+$/g, '') === normalized) === index
}
