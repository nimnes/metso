import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Search,
  X,
} from 'lucide-react'
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
  const [selectedBook, setSelectedBook] = useState<Book | undefined>()
  const [detailState, setDetailState] = useState<{ loading: boolean; error?: string; details?: BookDetails }>({ loading: false })
  const [uiLanguage, setUiLanguage] = useState(getStoredUiLanguage)
  const resultsTopRef = useRef<HTMLDivElement | null>(null)
  const [openFilterSections, setOpenFilterSections] = useState<Record<FilterSectionKey, boolean>>(getStoredFilterSections)
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
    let cancelled = false

    async function runSearch() {
      setState((current) => ({ ...current, loading: true, enriching: 0, error: undefined }))
      try {
        const result = await searchFinna(catalogueFilters, currentPage)
        if (cancelled) return
        setState({ loading: false, enriching: result.books.length, total: result.total, books: result.books })

        result.books.forEach((book) => {
          enrichBookRatings(
            book,
            (enrichedBook) => {
              if (cancelled) return
              setState((current) => updateBookInSearchState(current, enrichedBook))
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
  }, [catalogueFilters, currentPage])

  useEffect(() => {
    if (!selectedBook) return

    let cancelled = false
    const activeBook = selectedBook

    async function loadDetails() {
      setDetailState({ loading: true })
      try {
        const details = await getFinnaBookDetails(activeBook.finnaId)
        const description =
          details.description ||
          (await getOptionalPikiDescription(details.isbns[0])) ||
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
      if (event.key === 'Escape') setSelectedBook(undefined)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedBook])

  const displayedBooks = useMemo(() => sortDisplayedBooks(state.books, filters.sort, state.enriching), [filters.sort, state.books, state.enriching])
  const visibleBookCount = displayedBooks.length
  const totalPages = Math.max(Math.ceil(state.total / FINNA_PAGE_SIZE), 1)

  const changePage = useCallback((page: number) => {
    setCurrentPage(page)
    resultsTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!state.loading && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, state.loading, totalPages])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
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
    setSelectedBook(book)
  }, [])

  const searchAuthor = useCallback((author: string) => {
    setDraftQuery(author)
    setCurrentPage(1)
    setFilters((current) => ({ ...current, query: author }))
    setSelectedBook(undefined)
  }, [])

  const searchLibrary = useCallback((library: LibraryPresence) => {
    const matchingBranch = TAMPERE_BRANCHES.find((branch) => branch.code === `holdings:${library.code}` || branch.code === library.code)
    if (!matchingBranch) return

    setCurrentPage(1)
    setFilters((current) => ({ ...current, branchCodes: [matchingBranch.code] }))
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

          <LanguageSwitcher currentLanguage={uiLanguage} onChange={setUiLanguage} />
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
          <section className="status-bar" aria-live="polite">
            <span>{state.loading ? t.searching : t.resultCount(visibleBookCount, state.total)}</span>
          </section>

          {state.error ? (
            <div className="notice">
              {t.searchErrorPrefix} {translateError(state.error, uiLanguage)}
            </div>
          ) : null}

          <section className="book-grid">
            {displayedBooks.map((book) => (
              <BookCard book={book} key={book.id} onSelect={selectBook} uiLanguage={uiLanguage} />
            ))}
          </section>

          {!state.error && state.total > FINNA_PAGE_SIZE ? (
            <Pagination
              currentPage={currentPage}
              disabled={state.loading}
              totalPages={totalPages}
              onPageChange={changePage}
              uiLanguage={uiLanguage}
            />
          ) : null}

          {!state.loading && !state.error && visibleBookCount === 0 ? (
            <div className="empty">
              <BookOpen size={32} aria-hidden="true" />
              <p>{t.noMatches}</p>
            </div>
          ) : null}
        </div>
      </div>

      {selectedBook ? (
        <BookDetailsPanel
          book={selectedBook}
          detailState={detailState}
          onClose={() => setSelectedBook(undefined)}
          onSearchAuthor={searchAuthor}
          onSearchLibrary={searchLibrary}
          uiLanguage={uiLanguage}
        />
      ) : null}
    </main>
  )
}

async function getOptionalOpenLibraryDescription(isbn?: string): Promise<string | undefined> {
  try {
    return await getOpenLibraryDescription(isbn)
  } catch {
    return undefined
  }
}

async function enrichBookRatings(book: Book, onUpdate: (book: Book) => void, onComplete: () => void): Promise<void> {
  let enrichedBook = book

  try {
    try {
      enrichedBook = await enrichBookWithOpenLibrary(enrichedBook)
      onUpdate(enrichedBook)
    } catch {
      // Keep trying other optional enrichment sources.
    }

    try {
      enrichedBook = await enrichBookWithHardcover(enrichedBook)
      onUpdate(enrichedBook)
    } catch {
      // Ratings are optional enrichment; catalogue results should stay usable.
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
  return book.rating?.value ?? book.ratings?.openlibrary?.value ?? book.ratings?.hardcover?.value ?? book.ratings?.finna?.value ?? -1
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
  onSelect,
  uiLanguage,
}: {
  book: Book
  onSelect: (book: Book) => void
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
      <BookCover book={book} markers={<BookMarkers book={book} uiLanguage={uiLanguage} />} variant="card" uiLanguage={uiLanguage} />

      <div className="book-copy">
        <div className="book-main">
          <h2>{book.title}</h2>
          <p className="authors">{book.authors.length ? book.authors.join(', ') : t.unknownAuthor}</p>
          <div className="book-facts">
            {book.publicationYear ? <span>{t.published(book.publicationYear)}</span> : null}
            {book.languages.slice(0, 2).map((language) => (
              <span key={language}>{getBookLanguageLabel(language, uiLanguage)}</span>
            ))}
          </div>
        </div>

        {hasRatings(book.ratings) ? (
          <div className="card-rating-row">
            <Ratings ratings={book.ratings} uiLanguage={uiLanguage} />
          </div>
        ) : null}

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
  onClose,
  onSearchAuthor,
  onSearchLibrary,
  uiLanguage,
}: {
  book: Book
  detailState: { loading: boolean; error?: string; details?: BookDetails }
  onClose: () => void
  onSearchAuthor: (author: string) => void
  onSearchLibrary: (library: LibraryPresence) => void
  uiLanguage: UiLanguage
}) {
  const t = translations[uiLanguage]
  const details = detailState.details
  const displayBook = details ?? book
  const primaryAuthor = displayBook.authors[0]
  const publicationLine = formatPublicationLine(displayBook)
  const isbnLine = displayBook.isbns[0] ? formatIsbn(displayBook.isbns[0]) : undefined
  const formatLine = unique([formatBookFormat(displayBook.formats[0], uiLanguage), details?.edition].filter(Boolean) as string[]).join(', ')
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false)

  useEffect(() => {
    if (!detailState.loading) {
      setShowLoadingIndicator(false)
      return
    }

    const timeoutId = window.setTimeout(() => setShowLoadingIndicator(true), 300)
    return () => window.clearTimeout(timeoutId)
  }, [detailState.loading])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="details-panel" role="dialog" aria-modal="true" aria-labelledby="book-details-title" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label={t.closeDetails}>
          <X size={20} aria-hidden="true" />
        </button>

        <div className="details-cover-column">
          <BookCover book={displayBook} variant="detail" uiLanguage={uiLanguage} />
          <a className="piki-link details-link" href={displayBook.pikiUrl} target="_blank" rel="noreferrer">
            {t.openInPiki}
            <ExternalLink size={16} aria-hidden="true" />
          </a>
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
            {hasRatings(displayBook.ratings) ? <Ratings ratings={displayBook.ratings} uiLanguage={uiLanguage} /> : null}
          </div>

          {detailState.error ? <p className="detail-error">{translateError(detailState.error, uiLanguage)}</p> : null}

          <DetailSection title={t.description}>
            {details?.description ? <p>{details.description}</p> : null}
            {!details?.description && detailState.loading && showLoadingIndicator ? (
              <div className="detail-loading" role="status">
                <span className="loading-spinner" aria-hidden="true" />
                <span>{t.loadingDetails}</span>
              </div>
            ) : null}
            {!details?.description && !detailState.loading ? <p>{t.noDescription}</p> : null}
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

const RATING_SOURCES: RatingSource[] = ['openlibrary', 'hardcover', 'finna']

function BookMarkers({ book, uiLanguage }: { book: Book; uiLanguage: UiLanguage }) {
  if (!book.topLoaned && !book.recommended) return null

  return (
    <div className="book-markers">
      {book.topLoaned ? <TopLoanedMark book={book} uiLanguage={uiLanguage} /> : null}
      {book.recommended ? <RecommendedMark book={book} uiLanguage={uiLanguage} /> : null}
    </div>
  )
}

function Ratings({ ratings, uiLanguage }: { ratings?: Book['ratings']; uiLanguage: UiLanguage }) {
  const t = translations[uiLanguage]

  return (
    <span className="rating-list" aria-label={t.publicRatings}>
      {RATING_SOURCES.map((source) => {
        const rating = ratings?.[source]
        return (
          <span className="rating" key={source}>
            <RatingSourceMark source={source} uiLanguage={uiLanguage} />
            <strong>{rating ? rating.value.toFixed(1) : '--'}</strong>
            {rating ? <small>({formatRatingCount(rating.count)})</small> : null}
          </span>
        )
      })}
    </span>
  )
}

function TopLoanedMark({ book, uiLanguage }: { book: Book; uiLanguage: UiLanguage }) {
  if (!book.topLoaned) return null

  const label = translations[uiLanguage].topLoanedBook

  return (
    <span className="top-loaned-mark" title={label} aria-label={label}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
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
  const label = source === 'hardcover' ? t.ratingSourceHardcover : source === 'finna' ? t.ratingSourceFinna : t.ratingSourceOpenLibrary

  return (
    <span className={`rating-source rating-source-${source}`} title={label} aria-label={label}>
      {source === 'hardcover' ? 'H' : source === 'finna' ? 'FI' : 'OL'}
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
