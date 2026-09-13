import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Barcode,
  BookOpen,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Search,
  Share2,
  X,
} from 'lucide-react'
import { applyCachedBookEnrichment, hasCheckedRatingSource, rememberBookEnrichment } from './api/bookEnrichmentCache'
import { enrichBookWithFantLab } from './api/fantlab'
import { shouldUseFantLab } from './api/fantlabEligibility'
import { FINNA_PAGE_SIZE, getFinnaBookDetails, searchFinna } from './api/finna'
import { enrichBookWithHardcover, getHardcoverDescription } from './api/hardcover'
import { enrichBookWithMostRecommended } from './api/mostRecommendedBooks'
import { enrichBookWithOpenLibrary, getOpenLibraryDescription } from './api/openLibrary'
import { getPikiDescription } from './api/pikiDescription'
import { GENRE_OPTIONS } from './data/genreOptions'
import { LANGUAGE_OPTIONS, TAMPERE_BRANCHES } from './data/tampereBranches'
import { getStoredUiLanguage, translations, UI_LANGUAGE_STORAGE_KEY, UI_LANGUAGES } from './i18n'
import type { UiLanguage } from './i18n'
import type { Book, BookDetails, BookSearchFilters, LibraryPresence, RatingSource, SearchState, SortMode } from './types'

type BarcodeDetectionResult = {
  rawValue?: string
}

type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectionResult[]>
}

type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance
  getSupportedFormats?: () => Promise<string[]>
}

type ScannerControls = {
  stop: () => void
}

const initialFilters: BookSearchFilters = {
  query: '',
  languageCodes: [],
  genreValues: [],
  branchCodes: [],
  sort: 'relevance',
}

type FilterSectionKey = 'language' | 'genre' | 'library' | 'sort'

const GENERIC_SEARCH_ERROR = 'metso:search-failed'
const GENERIC_DETAILS_ERROR = 'metso:details-failed'
const FILTER_STORAGE_KEY = 'metso-search-filters'
const FILTER_SECTION_STORAGE_KEY = 'metso-filter-sections'
const WISHLIST_STORAGE_KEY = 'metso-wishlist'
const MOBILE_FINNA_PAGE_SIZE = 10
const initialFilterSections: Record<FilterSectionKey, boolean> = {
  language: true,
  genre: true,
  library: true,
  sort: true,
}

function App() {
  const [filters, setFilters] = useState<BookSearchFilters>(getStoredFilters)
  const [draftQuery, setDraftQuery] = useState(filters.query)
  const [currentPage, setCurrentPage] = useState(1)
  const [state, setState] = useState<SearchState>({ loading: true, enriching: 0, total: 0, books: [] })
  const [hasSearched, setHasSearched] = useState(true)
  const [selectedBook, setSelectedBook] = useState<Book | undefined>()
  const [detailState, setDetailState] = useState<{ loading: boolean; error?: string; details?: BookDetails }>({ loading: false })
  const [uiLanguage, setUiLanguage] = useState(getStoredUiLanguage)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [wishlistBooks, setWishlistBooks] = useState<Book[]>(getStoredWishlist)
  const [showWishlist, setShowWishlist] = useState(false)
  const resultsTopRef = useRef<HTMLDivElement | null>(null)
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const booksRef = useRef<Book[]>([])
  const selectedBookRef = useRef<Book | undefined>(undefined)
  const preloadedDetailIdsRef = useRef<Set<string>>(new Set())
  const [openFilterSections, setOpenFilterSections] = useState<Record<FilterSectionKey, boolean>>(getStoredFilterSections)
  const isMobileResults = useMediaQuery('(max-width: 620px)')
  const pageSize = isMobileResults ? MOBILE_FINNA_PAGE_SIZE : FINNA_PAGE_SIZE
  const t = translations[uiLanguage]
  const catalogueFilters = useMemo<BookSearchFilters>(
    () => ({
      query: filters.query,
      languageCodes: filters.languageCodes,
      genreValues: filters.genreValues,
      branchCodes: filters.branchCodes,
      sort: filters.sort,
    }),
    [filters.branchCodes, filters.genreValues, filters.languageCodes, filters.query, filters.sort],
  )

  useEffect(() => {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, uiLanguage)
    document.documentElement.lang = uiLanguage
  }, [uiLanguage])

  useEffect(() => {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        languageCodes: filters.languageCodes,
        genreValues: filters.genreValues,
        branchCodes: filters.branchCodes,
        sort: filters.sort,
      }),
    )
  }, [filters])

  useEffect(() => {
    window.localStorage.setItem(FILTER_SECTION_STORAGE_KEY, JSON.stringify(openFilterSections))
  }, [openFilterSections])

  useEffect(() => {
    storeWishlist(wishlistBooks)
  }, [wishlistBooks])

  useEffect(() => {
    booksRef.current = state.books
  }, [state.books])

  useEffect(() => {
    selectedBookRef.current = selectedBook
  }, [selectedBook])

  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize])

  useEffect(() => {
    function selectBookFromLocation() {
      const finnaId = getBookIdFromLocation()
      if (!finnaId) {
        setSelectedBook(undefined)
        return
      }

      const book = booksRef.current.find((candidate) => candidate.finnaId === finnaId)
      if (book) {
        setSelectedBook(book)
        return
      }

      setDetailState({ loading: true })
      getFinnaBookDetails(finnaId)
        .then((details) => {
          const enrichedDetails: BookDetails = { ...details, ...applyCachedBookEnrichment(details) }
          setSelectedBook(enrichedDetails)
          setDetailState({ loading: false, details: enrichedDetails })
        })
        .catch((error) => {
          setSelectedBook(undefined)
          setDetailState({ loading: false, error: error instanceof Error ? error.message : GENERIC_DETAILS_ERROR })
        })
    }

    selectBookFromLocation()
    window.addEventListener('popstate', selectBookFromLocation)
    return () => window.removeEventListener('popstate', selectBookFromLocation)
  }, [])

  useEffect(() => {
    if (!hasSearched) return

    let cancelled = false

    async function runSearch() {
      setState((current) => ({ ...current, loading: true, enriching: 0, error: undefined }))
      try {
        const result = await searchFinna(catalogueFilters, currentPage, pageSize)
        if (cancelled) return
        const books = result.books.map(applyCachedBookEnrichment)
        books.forEach((book) => rememberBookEnrichment(book, book.ratings?.finna ? 'finna' : undefined))
        setState((current) => {
          const nextBooks = isMobileResults && currentPage > 1 ? uniqueBooksById([...current.books, ...books]) : books
          return { loading: false, enriching: books.length, total: result.total, books: nextBooks }
        })

        books.forEach((book) => {
          enrichBookRatings(
            book,
            (enrichedBook) => {
              if (cancelled) return
              setState((current) => updateBookInSearchState(current, enrichedBook))
              setWishlistBooks((current) => updateBookInWishlist(current, enrichedBook))
              setDetailState((current) =>
                current.details?.id === enrichedBook.id
                  ? {
                      ...current,
                      details: {
                        ...current.details,
                        ratings: enrichedBook.ratings,
                        rating: enrichedBook.rating,
                        recommended: enrichedBook.recommended,
                      },
                    }
                  : current,
              )
            },
            () => {
              if (!cancelled) setState((current) => ({ ...current, enriching: Math.max(current.enriching - 1, 0) }))
            },
          )
        })
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            enriching: 0,
            total: 0,
            books: [],
            error: error instanceof Error ? error.message : GENERIC_SEARCH_ERROR,
          })
        }
      }
    }

    runSearch()
    return () => {
      cancelled = true
    }
  }, [catalogueFilters, currentPage, hasSearched, isMobileResults, pageSize])

  useEffect(() => {
    if (!selectedBook) return

    let cancelled = false
    const activeBook = selectedBook

    async function loadDetails() {
      setDetailState({ loading: true })
      try {
        const details = await getFinnaBookDetails(activeBook.finnaId)
        const description =
          (await getOptionalPikiDescription(details.isbns[0] ?? activeBook.isbns[0])) ||
          details.description ||
          activeBook.description ||
          (await getOptionalOpenLibraryDescription(details.isbns[0])) ||
          (await getOptionalHardcoverDescription(details))
        if (!cancelled) {
          setDetailState({
            loading: false,
            details: { ...activeBook, ...details, ratings: activeBook.ratings, rating: activeBook.rating, description },
          })
        }
      } catch (error) {
        if (!cancelled) {
          setDetailState({
            loading: false,
            error: error instanceof Error ? error.message : GENERIC_DETAILS_ERROR,
            details: {
              ...activeBook,
              classifications: [],
              contents: [],
              genres: [],
              physicalDescriptions: [],
              publicationInfo: [],
              publishers: [],
              series: [],
              catalogueLibraries: activeBook.branches,
            },
          })
        }
      }
    }

    loadDetails()
    return () => {
      cancelled = true
    }
  }, [selectedBook])

  useEffect(() => {
    if (!selectedBook) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (getBookIdFromLocation()) {
        if (isAppBookHistoryEntry()) {
          window.history.back()
        } else {
          removeBookFromCurrentUrl()
          setSelectedBook(undefined)
        }
        return
      }
      setSelectedBook(undefined)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedBook])

  const displayedBooks = useMemo(() => sortDisplayedBooks(state.books, filters.sort, state.enriching), [filters.sort, state.books, state.enriching])
  const wishlistIds = useMemo(() => new Set(wishlistBooks.map((book) => book.finnaId)), [wishlistBooks])
  const visibleBooks = showWishlist ? wishlistBooks : displayedBooks
  const visibleBookCount = visibleBooks.length
  const totalPages = Math.max(Math.ceil(state.total / pageSize), 1)
  const loadingMoreOnMobile = isMobileResults && currentPage > 1 && state.loading
  const canLoadMoreOnMobile = isMobileResults && hasSearched && !showWishlist && !state.error && !state.loading && currentPage < totalPages
  const mobileLoadMoreIndex = canLoadMoreOnMobile && visibleBooks.length > pageSize ? Math.max(visibleBooks.length - pageSize, 0) : -1

  useEffect(() => {
    if (showWishlist || state.loading || !visibleBooks.length) return

    let cancelled = false
    const booksToPreload = visibleBooks.filter((book) => !book.description && !preloadedDetailIdsRef.current.has(book.finnaId))
    booksToPreload.forEach((book) => preloadedDetailIdsRef.current.add(book.finnaId))

    async function preloadVisibleDetails() {
      for (const book of booksToPreload) {
        try {
          const details = await getFinnaBookDetails(book.finnaId)
          const description = (await getOptionalPikiDescription(details.isbns[0] ?? book.isbns[0])) || details.description
          if (cancelled || !description) continue

          setState((current) => updateBookDescriptionInSearchState(current, book.finnaId, description))
          setWishlistBooks((current) => updateBookDescriptionInWishlist(current, book.finnaId, description))
          setDetailState((current) =>
            selectedBookRef.current?.finnaId === book.finnaId && !current.details?.description
              ? { ...current, details: { ...details, ...applyCachedBookEnrichment(details) }, loading: false }
              : current,
          )
        } catch {
          // Description preload is opportunistic; the detail view still loads normally.
        }
      }
    }

    preloadVisibleDetails()
    return () => {
      cancelled = true
    }
  }, [showWishlist, state.loading, visibleBooks])

  const changePage = useCallback((page: number) => {
    setCurrentPage(page)
    resultsTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!canLoadMoreOnMobile) return

    const marker = mobileLoadMoreRef.current
    if (!marker) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setCurrentPage((page) => Math.min(page + 1, totalPages))
      },
      { rootMargin: '360px 0px' },
    )
    observer.observe(marker)
    return () => observer.disconnect()
  }, [canLoadMoreOnMobile, totalPages])

  useEffect(() => {
    if (!state.loading && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, state.loading, totalPages])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    setHasSearched(true)
    setCurrentPage(1)
    setFilters((current) => ({ ...current, query: draftQuery.trim() }))
  }

  function updateFilter<K extends keyof BookSearchFilters>(key: K, value: BookSearchFilters[K]) {
    setCurrentPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function updateMultiFilter(key: 'branchCodes' | 'genreValues' | 'languageCodes', value: string, optionCount: number) {
    setCurrentPage(1)
    setFilters((current) => {
      if (!value) return { ...current, [key]: [] }

      const currentValues = current[key]
      const selected = currentValues.includes(value) ? currentValues.filter((selectedValue) => selectedValue !== value) : [...currentValues, value]

      return {
        ...current,
        [key]: selected.length === optionCount ? [] : selected,
      }
    })
  }

  function toggleFilterSection(section: FilterSectionKey) {
    setOpenFilterSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const selectBook = useCallback((book: Book) => {
    pushBookToHistory(book.finnaId)
    setSelectedBook(book)
  }, [])

  const searchScannedBarcode = useCallback((value: string) => {
    setScannerOpen(false)
    setDraftQuery(value)
    setHasSearched(true)
    setCurrentPage(1)
    setFilters((current) => ({ ...current, query: value }))
    openListFromCurrentBook()
    setSelectedBook(undefined)
  }, [])

  const toggleWishlist = useCallback((book: Book) => {
    setWishlistBooks((current) => {
      if (current.some((savedBook) => savedBook.finnaId === book.finnaId)) {
        return current.filter((savedBook) => savedBook.finnaId !== book.finnaId)
      }

      return [book, ...current]
    })
  }, [])

  const closeSelectedBook = useCallback(() => {
    if (getBookIdFromLocation()) {
      if (isAppBookHistoryEntry()) {
        window.history.back()
      } else {
        removeBookFromCurrentUrl()
        setSelectedBook(undefined)
      }
      return
    }

    setSelectedBook(undefined)
  }, [])

  const searchAuthor = useCallback((author: string) => {
    setDraftQuery(author)
    setHasSearched(true)
    setCurrentPage(1)
    setFilters((current) => ({ ...current, query: author }))
    openListFromCurrentBook()
    setSelectedBook(undefined)
  }, [])

  const searchLibrary = useCallback((library: LibraryPresence) => {
    const matchingBranch = TAMPERE_BRANCHES.find((branch) => branch.code === `holdings:${library.code}` || branch.code === library.code)
    if (!matchingBranch) return

    setCurrentPage(1)
    setHasSearched(true)
    setFilters((current) => ({ ...current, branchCodes: [matchingBranch.code] }))
    openListFromCurrentBook()
    setSelectedBook(undefined)
  }, [])

  const languageOptions = LANGUAGE_OPTIONS.filter((option) => option.value).map((option) => ({
    value: option.value,
    label: getBookLanguageLabel(option.value, uiLanguage),
  }))
  const genreOptions = GENRE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.labels[uiLanguage],
  }))
  const libraryOptions = TAMPERE_BRANCHES.map((branch) => ({
    value: branch.code,
    label: getLibraryDisplayName(branch.label, uiLanguage),
  }))

  return (
    <main className="shell">
      <section className="search-panel">
        <div className="top-row">
          <div className="brand">
            <div className="brand-mark">
              <MetsoBirdMark />
            </div>
            <div>
              <h1>{t.appTitle}</h1>
            </div>
          </div>

          <div className="top-actions">
            <button className="wishlist-toggle" type="button" aria-label={t.wishlist} aria-pressed={showWishlist} title={t.wishlist} onClick={() => setShowWishlist((current) => !current)}>
              <Bookmark size={18} aria-hidden="true" fill={showWishlist ? 'currentColor' : 'none'} />
              <strong>{wishlistBooks.length}</strong>
            </button>
            <LanguageSwitcher currentLanguage={uiLanguage} onChange={setUiLanguage} />
          </div>
        </div>

        <form className="search-row" onSubmit={submitSearch}>
          <label className="search-box">
            <Search size={20} aria-hidden="true" />
            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchAriaLabel}
            />
            <button className="barcode-button" type="button" onClick={() => setScannerOpen(true)} aria-label={t.scanBarcode} title={t.scanBarcode}>
              <Barcode size={22} aria-hidden="true" />
            </button>
          </label>
          <button type="submit">
            <Search size={18} aria-hidden="true" />
            {t.searchButton}
          </button>
        </form>

      </section>

      <div className="results-layout">
        <aside className="filter-sidebar" aria-label={t.filtersAriaLabel}>
          <FilterPanelSection open={openFilterSections.language} title={t.languageFilter} onToggle={() => toggleFilterSection('language')}>
            <FilterCheckboxList
              allLabel={t.all}
              options={languageOptions}
              selectedValues={filters.languageCodes}
              onToggleValue={(value, optionCount) => updateMultiFilter('languageCodes', value, optionCount)}
            />
          </FilterPanelSection>

          <FilterPanelSection open={openFilterSections.genre} title={t.genreFilter} onToggle={() => toggleFilterSection('genre')}>
            <FilterCheckboxList
              allLabel={t.all}
              options={genreOptions}
              selectedValues={filters.genreValues}
              onToggleValue={(value, optionCount) => updateMultiFilter('genreValues', value, optionCount)}
            />
          </FilterPanelSection>

          <FilterPanelSection open={openFilterSections.library} title={t.libraryFilter} onToggle={() => toggleFilterSection('library')}>
            <FilterCheckboxList
              allLabel={t.all}
              options={libraryOptions}
              selectedValues={filters.branchCodes}
              onToggleValue={(value, optionCount) => updateMultiFilter('branchCodes', value, optionCount)}
            />
          </FilterPanelSection>

          <FilterPanelSection open={openFilterSections.sort} title={t.sortFilter} onToggle={() => toggleFilterSection('sort')}>
            <select className="sort-select" value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as SortMode)}>
              <option value="relevance">{t.sortRelevance}</option>
              <option value="newest">{t.sortNewest}</option>
              <option value="oldest">{t.sortOldest}</option>
              <option value="title">{t.sortTitle}</option>
              <option value="rating">{t.sortRating}</option>
            </select>
          </FilterPanelSection>
        </aside>

        <div className="results-main">
          <div ref={resultsTopRef} />
          {hasSearched ? (
            <section className="status-bar" aria-live="polite">
              <span>{showWishlist ? t.wishlistCount(wishlistBooks.length) : state.loading && !loadingMoreOnMobile ? t.searching : t.resultCount(visibleBookCount, state.total)}</span>
            </section>
          ) : null}

          {!showWishlist && state.error ? (
            <div className="notice">
              {t.searchErrorPrefix} {translateError(state.error, uiLanguage)}
            </div>
          ) : null}

          <section className="book-grid">
            {visibleBooks.map((book, index) => (
              <Fragment key={book.id}>
                {index === mobileLoadMoreIndex ? <div className="mobile-load-more" ref={mobileLoadMoreRef} aria-hidden="true" /> : null}
                <BookCard
                  book={book}
                  isWishlisted={wishlistIds.has(book.finnaId)}
                  onSelect={selectBook}
                  onToggleWishlist={toggleWishlist}
                  uiLanguage={uiLanguage}
                />
              </Fragment>
            ))}
          </section>

          {hasSearched && !showWishlist && !state.error && !isMobileResults && state.total > pageSize ? (
            <Pagination
              currentPage={currentPage}
              disabled={state.loading}
              totalPages={totalPages}
              onPageChange={changePage}
              uiLanguage={uiLanguage}
            />
          ) : null}

          {canLoadMoreOnMobile && mobileLoadMoreIndex < 0 ? (
            <div className="mobile-load-more" ref={mobileLoadMoreRef} aria-hidden="true" />
          ) : null}

          {loadingMoreOnMobile ? <div className="mobile-loading-more">{t.loadingMore}</div> : null}

          {hasSearched && !state.loading && (showWishlist || !state.error) && visibleBookCount === 0 ? (
            <div className="empty">
              <BookOpen size={32} aria-hidden="true" />
              <p>{showWishlist ? t.emptyWishlist : t.noMatches}</p>
            </div>
          ) : null}
        </div>
      </div>

      {selectedBook ? (
        <BookDetailsPanel
          book={selectedBook}
          detailState={detailState}
          onClose={closeSelectedBook}
          onSearchAuthor={searchAuthor}
          onSearchLibrary={searchLibrary}
          isWishlisted={wishlistIds.has(selectedBook.finnaId)}
          onToggleWishlist={toggleWishlist}
          uiLanguage={uiLanguage}
        />
      ) : null}

      {scannerOpen ? <BarcodeScannerDialog onClose={() => setScannerOpen(false)} onScan={searchScannedBarcode} uiLanguage={uiLanguage} /> : null}
    </main>
  )
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    function handleChange(event: MediaQueryListEvent) {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [query])

  return matches
}

async function getOptionalOpenLibraryDescription(isbn?: string): Promise<string | undefined> {
  try {
    return await getOpenLibraryDescription(isbn)
  } catch {
    return undefined
  }
}

function getBookIdFromLocation(): string | undefined {
  const url = new URL(window.location.href)
  const pathMatch = url.pathname.match(/^\/book\/([^/]+)\/?$/)
  const value = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]).trim() : url.searchParams.get('book')?.trim()
  return value || undefined
}

function getBookShareUrl(finnaId: string): string {
  return `${window.location.origin}/book/${encodeURIComponent(finnaId)}`
}

function getGoodreadsUrl(isbn: string): string {
  return `https://www.goodreads.com/book/isbn/${encodeURIComponent(isbn)}`
}

function pushBookToHistory(finnaId: string): void {
  const url = new URL(window.location.href)
  const nextPath = `/book/${encodeURIComponent(finnaId)}`
  if (url.pathname === nextPath) return

  window.history.pushState({ book: finnaId }, '', nextPath)
}

function removeBookFromCurrentUrl(): void {
  const url = new URL(window.location.href)
  const hasBookRoute = /^\/book\/[^/]+\/?$/.test(url.pathname)
  if (!hasBookRoute && !url.searchParams.has('book')) return

  url.searchParams.delete('book')
  window.history.replaceState(window.history.state, '', `/${url.search}${url.hash}`)
}

function openListFromCurrentBook(): void {
  const url = new URL(window.location.href)
  const hasBookRoute = /^\/book\/[^/]+\/?$/.test(url.pathname)
  if (!hasBookRoute && !url.searchParams.has('book')) return

  url.searchParams.delete('book')
  window.history.pushState({ list: true }, '', `/${url.search}${url.hash}`)
}

function isAppBookHistoryEntry(): boolean {
  return Boolean(window.history.state?.book)
}

async function enrichBookRatings(book: Book, onUpdate: (book: Book) => void, onComplete: () => void): Promise<void> {
  let enrichedBook = book

  try {
    if (!hasCheckedRatingSource(enrichedBook, 'openlibrary')) {
      try {
        enrichedBook = await enrichBookWithOpenLibrary(enrichedBook)
        rememberBookEnrichment(enrichedBook, 'openlibrary')
        onUpdate(enrichedBook)
      } catch {
        rememberBookEnrichment(enrichedBook, 'openlibrary')
        // Keep trying other optional enrichment sources.
      }
    }

    if (shouldUseFantLab(enrichedBook) && !hasCheckedRatingSource(enrichedBook, 'fantlab')) {
      try {
        enrichedBook = await enrichBookWithFantLab(enrichedBook)
        rememberBookEnrichment(enrichedBook, 'fantlab')
        onUpdate(enrichedBook)
      } catch {
        rememberBookEnrichment(enrichedBook, 'fantlab')
        // FantLab is optional and may only cover some genres.
      }
    }

    if (!hasCheckedRatingSource(enrichedBook, 'hardcover')) {
      try {
        enrichedBook = await enrichBookWithHardcover(enrichedBook)
        rememberBookEnrichment(enrichedBook, 'hardcover')
        onUpdate(enrichedBook)
      } catch {
        rememberBookEnrichment(enrichedBook, 'hardcover')
        // Ratings are optional enrichment; catalogue results should stay usable.
      }
    }

    try {
      enrichedBook = await enrichBookWithMostRecommended(enrichedBook)
      onUpdate(enrichedBook)
    } catch {
      // Recommendation markers are optional enrichment too.
    }
  } finally {
    onComplete()
  }
}

function updateBookInSearchState(state: SearchState, enrichedBook: Book): SearchState {
  return {
    ...state,
    books: state.books.map((book) => (book.id === enrichedBook.id ? { ...book, ...enrichedBook } : book)),
  }
}

function updateBookDescriptionInSearchState(state: SearchState, finnaId: string, description: string): SearchState {
  return {
    ...state,
    books: state.books.map((book) => (book.finnaId === finnaId ? { ...book, description } : book)),
  }
}

function uniqueBooksById(books: Book[]): Book[] {
  return Array.from(new Map(books.map((book) => [book.id, book])).values())
}

function updateBookInWishlist(wishlist: Book[], updatedBook: Book): Book[] {
  if (!wishlist.some((book) => book.finnaId === updatedBook.finnaId)) return wishlist

  return wishlist.map((book) => (book.finnaId === updatedBook.finnaId ? { ...book, ...updatedBook } : book))
}

function updateBookDescriptionInWishlist(wishlist: Book[], finnaId: string, description: string): Book[] {
  return wishlist.map((book) => (book.finnaId === finnaId ? { ...book, description } : book))
}

function sortDisplayedBooks(books: Book[], sort: SortMode, enriching: number): Book[] {
  if (sort !== 'rating' || enriching > 0) return books

  return books
    .map((book, index) => ({ book, index }))
    .sort((left, right) => {
      const ratingDifference = getSortableRating(right.book) - getSortableRating(left.book)
      if (ratingDifference) return ratingDifference
      return left.index - right.index
    })
    .map(({ book }) => book)
}

function getSortableRating(book: Book): number {
  const rating = book.rating ?? book.ratings?.openlibrary ?? book.ratings?.fantlab ?? book.ratings?.hardcover ?? book.ratings?.finna
  return rating ? normalizeSortableRating(rating) : -1
}

function normalizeSortableRating(rating: Book['rating']): number {
  if (!rating) return -1
  return rating.source === 'fantlab' ? rating.value / 2 : rating.value
}

async function getOptionalHardcoverDescription(book: Pick<Book, 'authors' | 'isbns' | 'publicationYear' | 'title'>): Promise<string | undefined> {
  try {
    return await getHardcoverDescription(book)
  } catch {
    return undefined
  }
}

async function getOptionalPikiDescription(isbn?: string): Promise<string | undefined> {
  try {
    return await getPikiDescription(isbn)
  } catch {
    return undefined
  }
}

function MetsoBirdMark() {
  return <img className="metso-bird-mark" src="/metso-icon.png" alt="" aria-hidden="true" />
}

function LanguageSwitcher({ currentLanguage, onChange }: { currentLanguage: UiLanguage; onChange: (language: UiLanguage) => void }) {
  return (
    <div className="ui-language" aria-label={translations[currentLanguage].uiLanguageLabel}>
      {UI_LANGUAGES.map((language) => (
        <button
          className="flag-button"
          type="button"
          aria-label={language.label}
          aria-pressed={currentLanguage === language.value}
          key={language.value}
          onClick={() => onChange(language.value)}
          title={language.label}
        >
          <span className={`flag flag-${language.value}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function BarcodeScannerDialog({ onClose, onScan, uiLanguage }: { onClose: () => void; onScan: (value: string) => void; uiLanguage: UiLanguage }) {
  const t = translations[uiLanguage]
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | undefined>()

  const handleDetectedValue = useCallback(
    (value: string): boolean => {
      const parsed = parseScannedBarcode(value)
      if (!parsed) {
        setError(t.scannerUnrecognizedCode)
        return false
      }

      onScan(parsed)
      return true
    },
    [onScan, t.scannerUnrecognizedCode],
  )

  useEffect(() => {
    let active = true
    let frameId = 0
    let stream: MediaStream | undefined
    let scannerControls: ScannerControls | undefined

    async function startScanner() {
      const Detector = getBarcodeDetectorConstructor()
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t.scannerUnsupported)
        return
      }

      if (!Detector) {
        await startZxingScanner()
        return
      }

      try {
        const supportedFormats = await Detector.getSupportedFormats?.()
        const requestedFormats = ['ean_13', 'ean_8', 'code_128', 'code_39']
        const formats = supportedFormats?.length ? requestedFormats.filter((format) => supportedFormats.includes(format)) : requestedFormats
        const detector = new Detector(formats.length ? { formats } : undefined)

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
          },
        })

        const video = videoRef.current
        if (!video || !active) return

        video.srcObject = stream
        await video.play()

        async function scanFrame() {
          if (!active || !videoRef.current) return

          try {
            if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              const detected = await detector.detect(videoRef.current)
              const value = detected[0]?.rawValue
              if (value && handleDetectedValue(value)) {
                return
              }
            }
          } catch {
            // Some browsers throw while the video is still settling; keep scanning.
          }

          frameId = window.requestAnimationFrame(scanFrame)
        }

        frameId = window.requestAnimationFrame(scanFrame)
      } catch {
        if (active) setError(t.scannerCameraError)
      }
    }

    async function startZxingScanner() {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39])
        hints.set(DecodeHintType.TRY_HARDER, true)
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 500,
        })
        scannerControls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
            },
          },
          videoRef.current ?? undefined,
          (result) => {
            const value = result?.getText()
            if (!active || !value) return

            handleDetectedValue(value)
          },
        )
      } catch {
        if (active) setError(t.scannerCameraError)
      }
    }

    startScanner()

    return () => {
      active = false
      window.cancelAnimationFrame(frameId)
      scannerControls?.stop()
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [handleDetectedValue, t.scannerCameraError, t.scannerUnsupported])

  return (
    <div className="scanner-backdrop" onClick={onClose}>
      <section className="scanner-panel" role="dialog" aria-modal="true" aria-label={t.scannerTitle} onClick={(event) => event.stopPropagation()}>
        <button className="icon-button scanner-close" type="button" onClick={onClose} aria-label={t.closeDetails}>
          <X size={20} aria-hidden="true" />
        </button>
        <h2>{t.scannerTitle}</h2>
        <p>{t.scannerHint}</p>
        <div className="scanner-viewfinder">
          <video ref={videoRef} autoPlay muted playsInline />
          <span aria-hidden="true" />
        </div>
        {error ? <p className="scanner-error">{error}</p> : null}
      </section>
    </div>
  )
}

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructor | undefined {
  return 'BarcodeDetector' in window ? (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector : undefined
}

function parseScannedBarcode(value: string): string | undefined {
  const normalized = value.replace(/[\s-]/g, '').toUpperCase()
  if (/^97[89][0-9]{10}$/.test(normalized)) return normalized

  return undefined
}

type MultiSelectOption = {
  value: string
  label: string
}

function FilterPanelSection({
  children,
  open,
  title,
  onToggle,
}: {
  children: ReactNode
  open: boolean
  title: string
  onToggle: () => void
}) {
  return (
    <section className="filter-section">
      <button className="filter-section-title" type="button" aria-expanded={open} onClick={onToggle}>
        <ChevronDown size={18} aria-hidden="true" />
        <span>{title}</span>
      </button>
      {open ? <div className="filter-section-body">{children}</div> : null}
    </section>
  )
}

function FilterCheckboxList({
  allLabel,
  selectedValues,
  options,
  onToggleValue,
}: {
  allLabel: string
  selectedValues: string[]
  options: MultiSelectOption[]
  onToggleValue: (value: string, optionCount: number) => void
}) {
  const allSelected = selectedValues.length === 0

  return (
    <div className="filter-options">
      <label className="filter-option">
        <input type="checkbox" checked={allSelected} onChange={() => onToggleValue('', options.length)} />
        <span>{allLabel}</span>
      </label>

      {options.map((option) => (
        <label className="filter-option" key={option.value}>
          <input type="checkbox" checked={selectedValues.includes(option.value)} onChange={() => onToggleValue(option.value, options.length)} />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  )
}

function Pagination({
  currentPage,
  disabled = false,
  onPageChange,
  totalPages,
  uiLanguage,
}: {
  currentPage: number
  disabled?: boolean
  onPageChange: (page: number) => void
  totalPages: number
  uiLanguage: UiLanguage
}) {
  const t = translations[uiLanguage]
  const previousPage = Math.max(currentPage - 1, 1)
  const nextPage = Math.min(currentPage + 1, totalPages)
  const atStart = currentPage <= 1
  const atEnd = currentPage >= totalPages

  return (
    <nav className="pagination" aria-label={t.paginationLabel}>
      <button type="button" disabled={disabled || atStart} onClick={() => onPageChange(1)} aria-label={t.firstPage} title={t.firstPage}>
        <ChevronsLeft size={18} aria-hidden="true" />
      </button>
      <button type="button" disabled={disabled || atStart} onClick={() => onPageChange(previousPage)} aria-label={t.previousPage} title={t.previousPage}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span>{t.pageCount(currentPage, totalPages)}</span>
      <button type="button" disabled={disabled || atEnd} onClick={() => onPageChange(nextPage)} aria-label={t.nextPage} title={t.nextPage}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button type="button" disabled={disabled || atEnd} onClick={() => onPageChange(totalPages)} aria-label={t.lastPage} title={t.lastPage}>
        <ChevronsRight size={18} aria-hidden="true" />
      </button>
    </nav>
  )
}

function BookCover({
  book,
  markers,
  uiLanguage,
  variant,
}: {
  book: Book
  markers?: ReactNode
  uiLanguage: UiLanguage
  variant: 'card' | 'detail'
}) {
  const candidates = useMemo(
    () =>
      unique([
        ...(book.coverUrls ?? []),
        book.coverUrl,
        ...book.isbns.map((isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`),
      ]),
    [book.coverUrl, book.coverUrls, book.isbns],
  )

  const [coverIndex, setCoverIndex] = useState(0)
  const coverKey = candidates.join('|')
  const coverUrl = candidates[coverIndex]

  useEffect(() => {
    setCoverIndex(0)
  }, [book.finnaId, coverKey])

  return (
    <div className={variant === 'card' ? 'cover-wrap' : 'details-cover'}>
      {markers}
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          loading={variant === 'card' ? 'lazy' : undefined}
          onError={() => setCoverIndex((current) => current + 1)}
          onLoad={(event) => {
            const image = event.currentTarget
            if (image.naturalWidth <= 16 && image.naturalHeight <= 16) {
              setCoverIndex((current) => current + 1)
            }
          }}
        />
      ) : (
        <CoverPlaceholder book={book} uiLanguage={uiLanguage} />
      )}
    </div>
  )
}

function CoverPlaceholder({ book, uiLanguage }: { book: Book; uiLanguage: UiLanguage }) {
  const t = translations[uiLanguage]

  return (
    <div className="cover-placeholder" aria-hidden="true">
      <div className="placeholder-mark">
        <BookOpen size={22} aria-hidden="true" />
      </div>
      <div>
        <p className="placeholder-title">{book.title}</p>
        <p className="placeholder-author">{book.authors[0] || t.tampereLibrary}</p>
      </div>
    </div>
  )
}

const BookCard = memo(function BookCard({
  book,
  isWishlisted,
  onSelect,
  onToggleWishlist,
  uiLanguage,
}: {
  book: Book
  isWishlisted: boolean
  onSelect: (book: Book) => void
  onToggleWishlist: (book: Book) => void
  uiLanguage: UiLanguage
}) {
  const t = translations[uiLanguage]
  const visibleBranches = book.branches.slice(0, 5)
  const hiddenBranchCount = Math.max(book.branches.length - visibleBranches.length, 0)

  function openCard() {
    onSelect(book)
  }

  return (
    <article
      className="book-card"
      role="button"
      tabIndex={0}
      onClick={openCard}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openCard()
        }
      }}
      aria-label={t.openDetailsFor(book.title)}
    >
      <div className="book-card-cover-column">
        <BookCover
          book={book}
          markers={
            <>
              <BookMarkers book={book} uiLanguage={uiLanguage} />
              <button
                className="wishlist-card-button"
                type="button"
                aria-label={isWishlisted ? t.removeFromWishlist : t.addToWishlist}
                aria-pressed={isWishlisted}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleWishlist(book)
                }}
                onKeyDown={(event) => event.stopPropagation()}
                title={isWishlisted ? t.removeFromWishlist : t.addToWishlist}
              >
                <Bookmark size={18} aria-hidden="true" fill={isWishlisted ? 'currentColor' : 'none'} />
              </button>
            </>
          }
          variant="card"
          uiLanguage={uiLanguage}
        />
      </div>

      <div className="book-copy">
        <div className="book-main">
          <h2>{book.title}</h2>
          <p className="authors">{book.authors.length ? book.authors.join(', ') : t.unknownAuthor}</p>
          <div className="book-facts">
            {[book.publicationYear ? t.published(book.publicationYear) : undefined, ...book.languages.slice(0, 2).map((language) => getBookLanguageLabel(language, uiLanguage))]
              .filter(Boolean)
              .map((fact, index) => (
                <span key={`${fact}-${index}`}>{fact}</span>
              ))}
          </div>
        </div>

        <div className="card-rating-row">{hasRatings(book.ratings) ? <Ratings book={book} ratings={book.ratings} uiLanguage={uiLanguage} /> : null}</div>

        <div className="branches">
          <strong>{t.tampereLibraries}</strong>
          {book.branches.length ? (
            <div className="branch-list">
              {visibleBranches.map((branch) => (
                <span className="branch-row" key={branch.code}>
                  {getLibraryDisplayName(branch.branch, uiLanguage)}
                </span>
              ))}
              {hiddenBranchCount ? <span className="branch-row branch-more">{t.moreBranches(hiddenBranchCount)}</span> : null}
            </div>
          ) : (
            <p>{t.noBranchDetails}</p>
          )}
        </div>
      </div>
    </article>
  )
})

function BookDetailsPanel({
  book,
  detailState,
  isWishlisted,
  onClose,
  onSearchAuthor,
  onSearchLibrary,
  onToggleWishlist,
  uiLanguage,
}: {
  book: Book
  detailState: { loading: boolean; error?: string; details?: BookDetails }
  isWishlisted: boolean
  onClose: () => void
  onSearchAuthor: (author: string) => void
  onSearchLibrary: (library: LibraryPresence) => void
  onToggleWishlist: (book: Book) => void
  uiLanguage: UiLanguage
}) {
  const t = translations[uiLanguage]
  const details = detailState.details
  const displayBook = details ?? book
  const visibleDescription = details?.description ?? displayBook.description
  const primaryAuthor = displayBook.authors[0]
  const publicationLine = formatPublicationLine(displayBook)
  const isbnLine = displayBook.isbns[0] ? formatIsbn(displayBook.isbns[0]) : undefined
  const formatLine = unique([formatBookFormat(displayBook.formats[0], uiLanguage), details?.edition].filter(Boolean) as string[]).join(', ')
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    if (!detailState.loading) {
      setShowLoadingIndicator(false)
      return
    }

    const timeoutId = window.setTimeout(() => setShowLoadingIndicator(true), 300)
    return () => window.clearTimeout(timeoutId)
  }, [detailState.loading])

  async function shareBook() {
    const shareUrl = getBookShareUrl(displayBook.finnaId)
    const shareText = primaryAuthor
      ? `${displayBook.title} - ${primaryAuthor}\n${shareUrl}`
      : `${displayBook.title}\n${shareUrl}`
    const shareData = {
      title: displayBook.title,
      text: shareText,
      url: shareUrl,
    }

    try {
      if (navigator.share && navigator.canShare?.(shareData) !== false) {
        await navigator.share(shareData)
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1800)
    } catch {
      window.open(shareUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="details-panel" role="dialog" aria-modal="true" aria-labelledby="book-details-title" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label={t.closeDetails}>
          <X className="close-button-icon" size={20} aria-hidden="true" />
          <ChevronLeft className="back-button-icon" size={20} aria-hidden="true" />
          <span className="back-button-label">{t.previousPage}</span>
        </button>

        <div className="details-cover-column">
          <BookCover book={displayBook} markers={<BookMarkers book={displayBook} uiLanguage={uiLanguage} />} variant="detail" uiLanguage={uiLanguage} />
          <a className="piki-link details-link" href={displayBook.pikiUrl} target="_blank" rel="noreferrer">
            {t.openInPiki}
            <ExternalLink size={16} aria-hidden="true" />
          </a>
          {displayBook.isbns[0] ? (
            <a className="piki-link details-link goodreads-link" href={getGoodreadsUrl(displayBook.isbns[0])} target="_blank" rel="noreferrer">
              {t.openInGoodreads}
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          ) : null}
          <button className="piki-link details-link wishlist-detail-link" type="button" onClick={() => onToggleWishlist(displayBook)}>
            {isWishlisted ? t.removeFromWishlist : t.addToWishlist}
            <Bookmark size={16} aria-hidden="true" fill={isWishlisted ? 'currentColor' : 'none'} />
          </button>
          <button className="piki-link details-link share-link" type="button" onClick={shareBook}>
            {shareCopied ? t.shareCopied : t.shareBook}
            <Share2 size={16} aria-hidden="true" />
          </button>
          {hasRatings(displayBook.ratings) ? (
            <div className="mobile-detail-rating">
              <Ratings book={displayBook} ratings={displayBook.ratings} uiLanguage={uiLanguage} />
            </div>
          ) : null}
        </div>

        <div className="details-main">
          <div className="details-heading piki-details-heading">
            {formatLine ? <p className="details-format">{formatLine}</p> : null}
            <h2 id="book-details-title">{displayBook.title}</h2>
            {primaryAuthor ? (
              <button className="author-link" type="button" onClick={() => onSearchAuthor(primaryAuthor)}>
                {primaryAuthor}
              </button>
            ) : (
              <p>{t.unknownAuthor}</p>
            )}
            {publicationLine ? <p className="details-publication-line">{publicationLine}</p> : null}
          </div>

          <div className="meta-row">
            {hasRatings(displayBook.ratings) ? <Ratings book={displayBook} ratings={displayBook.ratings} uiLanguage={uiLanguage} /> : null}
          </div>

          {detailState.error ? <p className="detail-error">{translateError(detailState.error, uiLanguage)}</p> : null}

          <DetailSection title={t.description}>
            {visibleDescription ? <p>{visibleDescription}</p> : null}
            {!visibleDescription && detailState.loading && showLoadingIndicator ? (
              <div className="detail-loading" role="status">
                <span className="loading-spinner" aria-hidden="true" />
                <span>{t.loadingDetails}</span>
              </div>
            ) : null}
            {!visibleDescription && !detailState.loading ? <p>{t.noDescription}</p> : null}
          </DetailSection>

          <dl className="piki-metadata">
            <DetailMetadataRow title={t.genre} values={details?.genres ?? []} />
            <DetailMetadataRow title={t.physicalDetails} values={details?.physicalDescriptions ?? []} />
            <DetailMetadataRow title={t.languages} values={displayBook.languages.map((language) => getBookLanguageLabel(language, uiLanguage))} />
            <DetailMetadataRow title={t.publisher} values={publicationLine ? [publicationLine] : []} />
            <DetailMetadataRow title={t.series} values={details?.series ?? []} />
            <DetailMetadataRow title={t.classification} values={details?.classifications ?? []} />
            <DetailMetadataRow title={t.subjects} values={displayBook.subjects} />
            <DetailMetadataRow title={t.additionalInformation} values={displayBook.authors} />
            <DetailMetadataRow title={t.isbn} values={isbnLine ? [isbnLine] : []} />
            <LibraryMetadataRow
              title={t.libraries}
              libraries={details?.catalogueLibraries.length ? details.catalogueLibraries : displayBook.branches}
              onSearchLibrary={onSearchLibrary}
              uiLanguage={uiLanguage}
            />
          </dl>

        </div>
      </section>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function DetailMetadataRow({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null

  return (
    <div className="detail-metadata-row">
      <dt>{title}</dt>
      <dd>
        {values.map((value, index) => (
          <span key={`${value}-${index}`}>{value}</span>
        ))}
      </dd>
    </div>
  )
}

function LibraryMetadataRow({
  libraries,
  onSearchLibrary,
  title,
  uiLanguage,
}: {
  libraries: LibraryPresence[]
  onSearchLibrary: (library: LibraryPresence) => void
  title: string
  uiLanguage: UiLanguage
}) {
  if (!libraries.length) return null

  return (
    <div className="detail-metadata-row">
      <dt>{title}</dt>
      <dd>
        {libraries.map((library) => (
          <button className="metadata-link" key={library.code} type="button" onClick={() => onSearchLibrary(library)}>
            {getLibraryDisplayName(library.branch, uiLanguage)}
          </button>
        ))}
      </dd>
    </div>
  )
}

const RATING_SOURCES: RatingSource[] = ['openlibrary', 'fantlab', 'hardcover', 'finna']

function BookMarkers({ book, uiLanguage }: { book: Book; uiLanguage: UiLanguage }) {
  if (!book.topLoaned && !book.recommended) return null

  return (
    <div className="book-markers">
      {book.topLoaned ? <TopLoanedMark book={book} uiLanguage={uiLanguage} /> : null}
      {book.recommended ? <RecommendedMark book={book} uiLanguage={uiLanguage} /> : null}
    </div>
  )
}

function Ratings({ book, ratings, uiLanguage }: { book: Pick<Book, 'authors' | 'isbns' | 'title'>; ratings?: Book['ratings']; uiLanguage: UiLanguage }) {
  const t = translations[uiLanguage]
  const availableRatings = RATING_SOURCES.flatMap((source) => {
    const rating = ratings?.[source]
    return rating ? [{ source, rating }] : []
  })

  if (!availableRatings.length) return null

  return (
    <span className="rating-list" aria-label={t.publicRatings}>
      {availableRatings.map(({ source, rating }) => {
        const ratingUrl = getRatingReviewUrl(rating, book)
        const content = (
          <>
            <RatingSourceMark source={source} uiLanguage={uiLanguage} />
            <strong>{rating.value.toFixed(1)}</strong>
            <small>({formatRatingCount(rating.count)})</small>
          </>
        )

        if (ratingUrl) {
          return (
            <a className="rating" href={ratingUrl} key={source} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
              {content}
            </a>
          )
        }

        return (
          <span className="rating" key={source}>
            {content}
          </span>
        )
      })}
    </span>
  )
}

function getRatingReviewUrl(rating: NonNullable<Book['rating']>, book: Pick<Book, 'authors' | 'isbns' | 'title'>): string | undefined {
  const url = getValidRatingUrl(rating.url)
  if (rating.source === 'openlibrary') {
    const openLibraryUrl = url ? getExternalRatingUrl(url, 'https://openlibrary.org').replace(/#.*$/, '') : getOpenLibraryFallbackUrl(book)
    return openLibraryUrl ? `${openLibraryUrl}#reviews` : undefined
  }
  if (rating.source === 'hardcover') {
    if (!url) return getHardcoverFallbackUrl(book)
    const hardcoverUrl = getExternalRatingUrl(url, 'https://hardcover.app').replace(/\/$/, '')
    return hardcoverUrl.endsWith('/reviews') ? hardcoverUrl : `${hardcoverUrl}/reviews`
  }
  if (!url) return undefined
  if (rating.source === 'fantlab') {
    const fantLabUrl = getExternalRatingUrl(url, 'https://fantlab.ru')
    return fantLabUrl.includes('?') ? fantLabUrl : `${fantLabUrl}?page=1`
  }
  return url
}

function getValidRatingUrl(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed !== 'undefined' ? trimmed : undefined
}

function getOpenLibraryFallbackUrl(book: Pick<Book, 'isbns'>): string | undefined {
  return book.isbns[0] ? `https://openlibrary.org/isbn/${book.isbns[0]}` : undefined
}

function getHardcoverFallbackUrl(book: Pick<Book, 'authors' | 'title'>): string {
  const query = [book.title, book.authors[0]].filter(Boolean).join(' ')
  return `https://hardcover.app/search?q=${encodeURIComponent(query)}`
}

function getExternalRatingUrl(value: string, origin: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.origin === window.location.origin) return new URL(parsed.pathname + parsed.search + parsed.hash, origin).toString()
    return parsed.toString()
  } catch {
    return new URL(value.startsWith('/') ? value : `/${value}`, origin).toString()
  }
}

function TopLoanedMark({ book, uiLanguage }: { book: Book; uiLanguage: UiLanguage }) {
  if (!book.topLoaned) return null

  const label = translations[uiLanguage].topLoanedBook

  return (
    <span className="top-loaned-mark" title={label} aria-label={label}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <path
          className="mark-outline"
          d="M12 2.2 14.3 4l2.9-.1 1.1 2.7 2.5 1.5-.7 2.9.7 2.8-2.5 1.6-1.1 2.7-2.9-.1-2.3 1.8L9.7 18l-2.9.1-1.1-2.7-2.5-1.6.7-2.8-.7-2.9 2.5-1.5 1.1-2.7 2.9.1L12 2.2Z"
        />
        <path
          fill="currentColor"
          d="M12 2.2 14.3 4l2.9-.1 1.1 2.7 2.5 1.5-.7 2.9.7 2.8-2.5 1.6-1.1 2.7-2.9-.1-2.3 1.8L9.7 18l-2.9.1-1.1-2.7-2.5-1.6.7-2.8-.7-2.9 2.5-1.5 1.1-2.7 2.9.1L12 2.2Z"
        />
        <path fill="#fffdfa" d="m10.7 14.7-3-3 1.3-1.3 1.7 1.7 4.4-4.5 1.4 1.3-5.8 5.8Z" />
      </svg>
    </span>
  )
}

function RecommendedMark({ book, uiLanguage }: { book: Book; uiLanguage: UiLanguage }) {
  if (!book.recommended) return null

  const label = translations[uiLanguage].recommendedBook(book.recommended.recommendersCount)

  return (
    <span className="recommended-mark" title={label} aria-label={label}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <path
          className="mark-outline"
          d="M12 2.2 14.3 4l2.9-.1 1.1 2.7 2.5 1.5-.7 2.9.7 2.8-2.5 1.6-1.1 2.7-2.9-.1-2.3 1.8L9.7 18l-2.9.1-1.1-2.7-2.5-1.6.7-2.8-.7-2.9 2.5-1.5 1.1-2.7 2.9.1L12 2.2Z"
        />
        <path
          fill="currentColor"
          d="M12 2.2 14.3 4l2.9-.1 1.1 2.7 2.5 1.5-.7 2.9.7 2.8-2.5 1.6-1.1 2.7-2.9-.1-2.3 1.8L9.7 18l-2.9.1-1.1-2.7-2.5-1.6.7-2.8-.7-2.9 2.5-1.5 1.1-2.7 2.9.1L12 2.2Z"
        />
        <path fill="#fffdfa" d="m10.7 14.7-3-3 1.3-1.3 1.7 1.7 4.4-4.5 1.4 1.3-5.8 5.8Z" />
      </svg>
    </span>
  )
}

function hasRatings(ratings?: Book['ratings']): boolean {
  return RATING_SOURCES.some((source) => ratings?.[source])
}

function translateError(error: string, uiLanguage: UiLanguage): string {
  const t = translations[uiLanguage]
  if (error === GENERIC_SEARCH_ERROR) return t.searchFailed
  if (error === GENERIC_DETAILS_ERROR) return t.detailsLoadFailed
  return error
}

function getStoredFilters(): BookSearchFilters {
  if (typeof window === 'undefined') return initialFilters

  try {
    const stored = window.localStorage.getItem(FILTER_STORAGE_KEY)
    if (!stored) return initialFilters

    return normalizeStoredFilters(JSON.parse(stored))
  } catch {
    return initialFilters
  }
}

function normalizeStoredFilters(value: unknown): BookSearchFilters {
  if (!value || typeof value !== 'object') return initialFilters

  const stored = value as Partial<BookSearchFilters>
  const allowedLanguages = new Set(LANGUAGE_OPTIONS.map((option) => option.value).filter(Boolean))
  const allowedGenres = new Set(GENRE_OPTIONS.map((option) => option.value))
  const allowedBranches = new Set(TAMPERE_BRANCHES.map((branch) => branch.code))

  return {
    query: initialFilters.query,
    languageCodes: normalizeStoredStringList(stored.languageCodes, allowedLanguages),
    genreValues: normalizeStoredStringList(stored.genreValues, allowedGenres),
    branchCodes: normalizeStoredStringList(stored.branchCodes, allowedBranches),
    sort: normalizeStoredSort(stored.sort),
  }
}

function getStoredFilterSections(): Record<FilterSectionKey, boolean> {
  if (typeof window === 'undefined') return initialFilterSections

  try {
    const stored = window.localStorage.getItem(FILTER_SECTION_STORAGE_KEY)
    if (!stored) return initialFilterSections

    return normalizeStoredFilterSections(JSON.parse(stored))
  } catch {
    return initialFilterSections
  }
}

function normalizeStoredFilterSections(value: unknown): Record<FilterSectionKey, boolean> {
  if (!value || typeof value !== 'object') return initialFilterSections

  const stored = value as Partial<Record<FilterSectionKey, unknown>>

  return {
    language: typeof stored.language === 'boolean' ? stored.language : initialFilterSections.language,
    genre: typeof stored.genre === 'boolean' ? stored.genre : initialFilterSections.genre,
    library: typeof stored.library === 'boolean' ? stored.library : initialFilterSections.library,
    sort: typeof stored.sort === 'boolean' ? stored.sort : initialFilterSections.sort,
  }
}

function normalizeStoredStringList(value: unknown, allowedValues: Set<string>): string[] {
  if (!Array.isArray(value)) return []
  return unique(value.filter((item): item is string => typeof item === 'string' && allowedValues.has(item)))
}

function normalizeStoredSort(value: unknown): SortMode {
  return value === 'newest' || value === 'oldest' || value === 'title' || value === 'rating' || value === 'relevance' ? value : initialFilters.sort
}

function getStoredWishlist(): Book[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(WISHLIST_STORAGE_KEY)
    if (!stored) return []

    return normalizeStoredWishlist(JSON.parse(stored))
  } catch {
    return []
  }
}

function storeWishlist(books: Book[]): void {
  try {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(books.slice(0, 100)))
  } catch {
    // Best-effort local wishlist only.
  }
}

function normalizeStoredWishlist(value: unknown): Book[] {
  if (!Array.isArray(value)) return []

  const books = value.filter(isStoredBook)
  return Array.from(new Map(books.map((book) => [book.finnaId, book])).values())
}

function isStoredBook(value: unknown): value is Book {
  if (!value || typeof value !== 'object') return false

  const book = value as Partial<Book>
  return (
    typeof book.id === 'string' &&
    typeof book.finnaId === 'string' &&
    typeof book.title === 'string' &&
    Array.isArray(book.authors) &&
    Array.isArray(book.isbns) &&
    Array.isArray(book.languages) &&
    Array.isArray(book.subjects) &&
    Array.isArray(book.formats) &&
    Array.isArray(book.coverUrls) &&
    Array.isArray(book.branches) &&
    typeof book.pikiUrl === 'string'
  )
}

function getBookLanguageLabel(language: string, uiLanguage: UiLanguage): string {
  const labels = translations[uiLanguage].bookLanguages
  return labels[language as keyof typeof labels] || language
}

function formatBookFormat(format: string | undefined, uiLanguage: UiLanguage): string | undefined {
  if (!format) return undefined
  if (format === 'Kirja' || format.toLowerCase() === 'book') return translations[uiLanguage].bookFormat
  return format
}

function formatPublicationLine(book: Pick<BookDetails, 'edition' | 'publicationInfo' | 'publicationYear' | 'publishers'> | Book): string | undefined {
  const details = book as Partial<BookDetails>
  const publicationInfo = details.publicationInfo?.join(' ').replace(/\s+/g, ' ').trim()
  const publishers = details.publishers?.join(', ').trim()
  const year = book.publicationYear ? String(book.publicationYear) : ''
  const edition = details.edition?.trim()
  const parts = unique([publicationInfo, publishers, year].filter(Boolean) as string[])
  const line = parts.join(' ').replace(/\s+([:,.])/g, '$1').replace(/\s+/g, ' ').trim()
  return [line, edition].filter(Boolean).join('. ') || undefined
}

function formatIsbn(isbn: string): string {
  if (isbn.length === 13) return `${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 6)}-${isbn.slice(6, 12)}-${isbn.slice(12)}`
  if (isbn.length === 10) return `${isbn.slice(0, 1)}-${isbn.slice(1, 4)}-${isbn.slice(4, 9)}-${isbn.slice(9)}`
  return isbn
}

function getLibraryDisplayName(name: string, uiLanguage: UiLanguage): string {
  if (name === 'Main library Metso' || name === 'Main Library Metso') {
    return translations[uiLanguage].mainLibraryMetso
  }

  return name
}

function RatingSourceMark({ source, uiLanguage }: { source: RatingSource; uiLanguage: UiLanguage }) {
  const t = translations[uiLanguage]
  const label =
    source === 'hardcover'
      ? t.ratingSourceHardcover
      : source === 'finna'
        ? t.ratingSourceFinna
        : source === 'fantlab'
          ? t.ratingSourceFantLab
          : t.ratingSourceOpenLibrary

  return (
    <span className={`rating-source rating-source-${source}`} title={label} aria-label={label}>
      {source === 'hardcover' ? 'H' : source === 'finna' ? 'FI' : source === 'fantlab' ? 'FL' : 'OL'}
    </span>
  )
}

function formatRatingCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}m`
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}k`
  return count.toString()
}

function unique<T>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[]))
}

export default App
