import { FEATURED_LANGUAGE_CODES, OTHER_LANGUAGE_FILTER_VALUE, TAMPERE_CITY_CODE, TAMPERE_HOLDING_LABELS } from '../data/tampereBranches'
import { GENRE_OPTIONS } from '../data/genreOptions'
import { TOP_LOANED_BOOK_IDENTIFIER_SET } from '../data/topLoanedBooks'
import type { Book, BookDetails, BookRating, BookSearchFilters, LibraryPresence } from '../types'
import { removeDuplicateRussianTransliteration } from './descriptionCleanup'

const FINNA_API_BASE = 'https://api.finna.fi/v1'
const PIKI_BASE = 'https://piki.finna.fi'
export const FINNA_PAGE_SIZE = 20
const STRICT_LANGUAGE_API_PAGE_SIZE = 100
const CHILDREN_GENRE_VALUE = 'children'
const CHILDREN_GENRE_FILTERS = GENRE_OPTIONS.find((option) => option.value === CHILDREN_GENRE_VALUE)?.finnaValues ?? []

type FinnaTranslatedField = {
  value: string
  translated: string
}

type FinnaAuthorBuckets = Record<string, Record<string, { role?: string[] }>>

type FinnaRecord = {
  id: string
  title?: string
  authors?: FinnaAuthorBuckets
  nonPresenterAuthors?: Array<{ name: string; name_alt?: string; role?: string }>
  year?: string
  languages?: string[]
  subjects?: string[][]
  formats?: FinnaTranslatedField[]
  images?: string[]
  isbns?: string[]
  cleanIsbn?: string
  buildings?: FinnaTranslatedField[]
  recordPage?: string
  rating?: {
    average?: number
    count?: number
  }
  summary?: string[]
  contents?: string[]
  physicalDescriptions?: string[]
  publicationInfo?: string[]
  publishers?: string[]
  series?: Array<{ name?: string; additional?: string }>
  rawData?: {
    author?: string[]
    'callnumber-search'?: string[]
    'callnumber-raw'?: string[]
    classification_txt_mv?: string[]
    edition?: string
    genre?: string[]
    genre_facet?: string[]
    holdings_txtP_mv?: string[]
    isbn?: string[]
    title_alt?: string[]
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
  'rating',
  'summary',
  'rawData',
]

const DETAIL_FIELDS = [
  ...REQUESTED_FIELDS,
  'contents',
  'physicalDescriptions',
  'publicationInfo',
  'publishers',
  'series',
]

export async function searchFinna(filters: BookSearchFilters, page = 1, pageSize = FINNA_PAGE_SIZE): Promise<{ total: number; books: Book[] }> {
  if (filters.languageCodes.length) return searchFinnaWithPrimaryLanguage(filters, page, pageSize)

  const data = await fetchFinnaSearch(filters, page, pageSize)

  return {
    total: data.resultCount ?? 0,
    books: (data.records ?? []).map(normalizeFinnaBook),
  }
}

async function searchFinnaWithPrimaryLanguage(filters: BookSearchFilters, page: number, pageSize: number): Promise<{ total: number; books: Book[] }> {
  const targetStart = (page - 1) * pageSize
  const targetEnd = targetStart + pageSize
  const matches: FinnaRecord[] = []
  let scanned = 0
  let rawTotal = 0
  let apiPage = 1

  while (matches.length < targetEnd && (apiPage === 1 || scanned < rawTotal)) {
    const data = await fetchFinnaSearch(filters, apiPage, STRICT_LANGUAGE_API_PAGE_SIZE)
    const records = data.records ?? []
    rawTotal = data.resultCount ?? rawTotal
    scanned += records.length
    matches.push(...records.filter((record) => matchesPrimaryLanguage(record, filters.languageCodes)))

    if (records.length < STRICT_LANGUAGE_API_PAGE_SIZE || scanned >= rawTotal) break
    apiPage += 1
  }

  const pageRecords = matches.slice(targetStart, targetEnd)
  const total = scanned >= rawTotal ? targetStart + pageRecords.length : rawTotal

  return {
    total,
    books: pageRecords.map(normalizeFinnaBook),
  }
}

async function fetchFinnaSearch(filters: BookSearchFilters, page: number, limit: number): Promise<FinnaSearchResponse> {
  const params = new URLSearchParams()
  params.set('lookfor', filters.query.trim() || '*')
  params.set('type', 'AllFields')
  params.set('sort', sortToFinna(filters.sort))
  params.set('limit', String(limit))
  params.set('page', String(page))

  REQUESTED_FIELDS.forEach((field) => params.append('field[]', field))
  params.append('filter[]', 'finna.deduplication:"0"')
  params.append('filter[]', `building:"${TAMPERE_CITY_CODE}"`)
  filters.branchCodes
    .filter((branchCode) => branchCode.startsWith('holdings:'))
    .forEach((branchCode) => {
      params.append('filter[]', `~holdings_txtP_mv:"${branchCode.replace('holdings:', '')}"`)
    })
  params.append('filter[]', 'format:"0/Book/"')

  if (!filters.languageCodes.includes(OTHER_LANGUAGE_FILTER_VALUE)) {
    filters.languageCodes.forEach((language) => {
      params.append('filter[]', `~language:"${language}"`)
    })
  }

  filters.genreValues
    .flatMap((genreValue) => GENRE_OPTIONS.find((option) => option.value === genreValue)?.finnaValues ?? [])
    .forEach((value) => {
      params.append('filter[]', `~genre_facet:"${value}"`)
    })

  if (filters.genreValues.length > 0 && !filters.genreValues.includes(CHILDREN_GENRE_VALUE)) {
    CHILDREN_GENRE_FILTERS.forEach((value) => {
      params.append('filter[]', `-genre_facet:"${value}"`)
    })
  }

  const response = await fetch(`${FINNA_API_BASE}/search?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Finna request failed with ${response.status}`)
  }

  const data = (await response.json()) as FinnaSearchResponse
  if (data.status !== 'OK') {
    throw new Error(data.statusMessage || 'Finna returned an error')
  }

  return data
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
  const finnaRating = normalizeFinnaRating(record.rating)
  const pikiUrl = record.recordPage ? `${PIKI_BASE}${record.recordPage}` : `${PIKI_BASE}/Record/${record.id}`
  const coverUrls = unique([
    ...(record.images ?? []).map(normalizePikiUrl),
    buildPikiCoverUrl(record, isbns),
    ...isbns.map(openLibraryCoverUrl).filter(Boolean),
  ] as string[])

  return {
    id: record.id,
    finnaId: record.id,
    title: getDisplayTitle(record),
    authors: normalizeAuthors(record),
    isbns,
    languages: record.languages ?? [],
    publicationYear: record.year ? Number.parseInt(record.year, 10) || undefined : undefined,
    subjects: normalizeSubjects(record.subjects),
    formats: (record.formats ?? []).map((format) => format.translated),
    coverUrl: coverUrls[0],
    coverUrls,
    description: cleanDescription(record.summary?.[0]),
    ratings: finnaRating ? { finna: { ...finnaRating, url: pikiUrl } } : undefined,
    rating: finnaRating ? { ...finnaRating, url: pikiUrl } : undefined,
    topLoaned: hasTopLoanedIdentifier(isbns),
    branches: normalizeBranches(record),
    pikiUrl,
  }
}

function matchesPrimaryLanguage(record: FinnaRecord, languageCodes: string[]): boolean {
  if (languageCodes.length === 0) return true

  const primaryLanguage = record.languages?.[0] ?? ''
  return languageCodes.some((language) => {
    if (language === OTHER_LANGUAGE_FILTER_VALUE) {
      return Boolean(primaryLanguage) && !FEATURED_LANGUAGE_CODES.includes(primaryLanguage)
    }

    return primaryLanguage === language
  })
}

function normalizeFinnaRating(rating?: FinnaRecord['rating']): BookRating | undefined {
  if (!rating?.average || !rating.count) return undefined

  return {
    value: rating.average > 5 ? rating.average / 20 : rating.average,
    count: rating.count,
    source: 'finna',
  }
}

function getDisplayTitle(record: FinnaRecord): string {
  return record.rawData?.title_alt?.map(cleanText).find((title) => /[А-Яа-яЁё]/.test(title)) || record.title || 'Untitled'
}

function hasTopLoanedIdentifier(identifiers: string[]): boolean {
  return identifiers.some((identifier) => TOP_LOANED_BOOK_IDENTIFIER_SET.has(identifier))
}

function normalizeFinnaBookDetails(record: FinnaRecord): BookDetails {
  const book = normalizeFinnaBook(record)

  return {
    ...book,
    classifications: normalizeClassifications(record.rawData?.classification_txt_mv),
    description: cleanDescription(record.summary?.[0]),
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
    return unique(record.nonPresenterAuthors.map(getDisplayAuthorName)).slice(0, 4)
  }

  const buckets = record.authors ?? {}
  return unique(
    Object.values(buckets)
      .flatMap((bucket) => Object.keys(bucket))
      .map(cleanAuthorName),
  ).slice(0, 4)
}

function getDisplayAuthorName(author: { name: string; name_alt?: string }): string {
  const nativeName = cleanAuthorName(author.name_alt ?? '')
  return /[А-Яа-яЁё]/.test(nativeName) ? nativeName : cleanAuthorName(author.name)
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

function cleanDescription(value?: string): string | undefined {
  const cleaned = cleanText(value)
  if (!cleaned) return undefined

  return removeDuplicateRussianTransliteration(cleaned)
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

function buildPikiCoverUrl(record: FinnaRecord, isbns: string[]): string | undefined {
  const params = new URLSearchParams()
  const author = normalizeAuthors(record)[0] ?? cleanText(record.rawData?.author?.[0])
  const callnumber = record.rawData?.['callnumber-search']?.[0] ?? record.rawData?.['callnumber-raw']?.[0]
  const visibleIsbn = normalizeIsbns([record.cleanIsbn, ...(record.rawData?.isbn ?? []), ...(record.isbns ?? [])].filter(Boolean) as string[])[0]
  const invisibleIsbn = normalizeIsbns([...(record.rawData?.isbn ?? []), ...(record.isbns ?? [])].filter(Boolean) as string[]).find((isbn) => isbn.length === 13)

  params.set('source', 'Solr')
  params.set('size', 'large')
  params.set('title', record.title ?? '')
  params.set('recordid', record.id)
  params.set('index', '0')
  if (author) params.set('author', author)
  if (callnumber) params.set('callnumber', callnumber)
  if (visibleIsbn ?? isbns[0]) params.set('isbns[0]', visibleIsbn ?? isbns[0])
  if (invisibleIsbn) params.set('invisbn', invisibleIsbn)

  return `${PIKI_BASE}/Cover/Show?${params.toString()}`
}

function normalizePikiUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${PIKI_BASE}${pathOrUrl}`
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
