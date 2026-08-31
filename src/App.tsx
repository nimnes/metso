import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, Calendar, ExternalLink, Filter, Hash, LibraryBig, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { getFinnaBookDetails, searchFinna } from './api/finna'
import { enrichBooksWithOpenLibrary, getOpenLibraryDescription } from './api/openLibrary'
import { LANGUAGE_LABELS, LANGUAGE_OPTIONS, TAMPERE_BRANCHES } from './data/tampereBranches'
import type { Book, BookDetails, BookSearchFilters, SearchState, SortMode } from './types'

const initialFilters: BookSearchFilters = {
  query: 'mestar* margarita',
  language: '',
  branchCode: '',
  minRating: 0,
  sort: 'relevance',
}

function App() {
  const [filters, setFilters] = useState<BookSearchFilters>(initialFilters)
  const [draftQuery, setDraftQuery] = useState(initialFilters.query)
  const [state, setState] = useState<SearchState>({ loading: true, total: 0, books: [] })
  const [selectedBook, setSelectedBook] = useState<Book | undefined>()
  const [detailState, setDetailState] = useState<{ loading: boolean; error?: string; details?: BookDetails }>({ loading: false })

  useEffect(() => {
    let cancelled = false

    async function runSearch() {
      setState((current) => ({ ...current, loading: true, error: undefined }))
      try {
        const result = await searchFinna(filters)
        if (cancelled) return
        setState({ loading: false, total: result.total, books: result.books })

        const enriched = await enrichBooksWithOpenLibrary(result.books)
        if (!cancelled) {
          setState({ loading: false, total: result.total, books: enriched })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            total: 0,
            books: [],
            error: error instanceof Error ? error.message : 'Search failed',
          })
        }
      }
    }

    runSearch()
    return () => {
      cancelled = true
    }
  }, [filters])

  useEffect(() => {
    if (!selectedBook) return

    let cancelled = false
    const activeBook = selectedBook

    async function loadDetails() {
      setDetailState({ loading: true })
      try {
        const details = await getFinnaBookDetails(activeBook.finnaId)
        const description = details.description || (await getOptionalOpenLibraryDescription(details.isbns[0]))
        if (!cancelled) {
          setDetailState({ loading: false, details: { ...activeBook, ...details, rating: activeBook.rating, description } })
        }
      } catch (error) {
        if (!cancelled) {
          setDetailState({
            loading: false,
            error: error instanceof Error ? error.message : 'Book details could not be loaded',
            details: { ...activeBook, contents: [], physicalDescriptions: [], publicationInfo: [], publishers: [], series: [], catalogueLibraries: activeBook.branches },
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

  const visibleBooks = useMemo(() => {
    const filtered = state.books.filter((book) => (filters.minRating ? (book.rating?.value ?? 0) >= filters.minRating : true))
    if (filters.sort !== 'rating') return filtered
    return [...filtered].sort((a, b) => (b.rating?.value ?? 0) - (a.rating?.value ?? 0))
  }, [filters.minRating, filters.sort, state.books])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    setFilters((current) => ({ ...current, query: draftQuery.trim() }))
  }

  function updateFilter<K extends keyof BookSearchFilters>(key: K, value: BookSearchFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <main className="shell">
      <section className="search-panel">
        <div className="brand">
          <div className="brand-mark">
            <LibraryBig size={26} aria-hidden="true" />
          </div>
          <div>
            <p>Metso</p>
            <h1>Tampere library book finder</h1>
          </div>
        </div>

        <form className="search-row" onSubmit={submitSearch}>
          <label className="search-box">
            <Search size={20} aria-hidden="true" />
            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search title, author, subject or ISBN"
              aria-label="Search books"
            />
          </label>
          <button type="submit">
            <Search size={18} aria-hidden="true" />
            Search
          </button>
        </form>

        <div className="filters" aria-label="Search filters">
          <label>
            <Filter size={16} aria-hidden="true" />
            <span>Language</span>
            <select value={filters.language} onChange={(event) => updateFilter('language', event.target.value)}>
              {LANGUAGE_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <LibraryBig size={16} aria-hidden="true" />
            <span>Library</span>
            <select value={filters.branchCode} onChange={(event) => updateFilter('branchCode', event.target.value)}>
              <option value="">All Tampere city libraries</option>
              {TAMPERE_BRANCHES.map((branch) => (
                <option value={branch.code} key={branch.code}>
                  {branch.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <Star size={16} aria-hidden="true" />
            <span>Rating</span>
            <input
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={filters.minRating}
              onChange={(event) => updateFilter('minRating', Number(event.target.value))}
            />
            <strong>{filters.minRating ? `${filters.minRating}+` : 'Any'}</strong>
          </label>

          <label>
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>Sort</span>
            <select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as SortMode)}>
              <option value="relevance">Relevance</option>
              <option value="rating">Rating</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
      </section>

      <section className="status-bar" aria-live="polite">
        <span>{state.loading ? 'Searching PIKI and Open Library...' : `${visibleBooks.length} shown from ${state.total} PIKI matches`}</span>
        <span>Catalogue presence is from Finna; live loan status is not exposed by this public endpoint.</span>
      </section>

      {state.error ? <div className="notice">Could not search right now: {state.error}</div> : null}

      <section className="book-grid">
        {visibleBooks.map((book) => (
          <BookCard book={book} key={book.id} onSelect={setSelectedBook} />
        ))}
      </section>

      {!state.loading && !state.error && visibleBooks.length === 0 ? (
        <div className="empty">
          <BookOpen size={32} aria-hidden="true" />
          <p>No matching books found.</p>
        </div>
      ) : null}

      {selectedBook ? <BookDetailsPanel book={selectedBook} detailState={detailState} onClose={() => setSelectedBook(undefined)} /> : null}
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

function BookCover({ book, variant }: { book: Book; variant: 'card' | 'detail' }) {
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
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          loading={variant === 'card' ? 'lazy' : undefined}
          onError={() => setCoverIndex((current) => current + 1)}
        />
      ) : (
        <CoverPlaceholder book={book} />
      )}
    </div>
  )
}

function CoverPlaceholder({ book }: { book: Book }) {
  return (
    <div className="cover-placeholder" aria-hidden="true">
      <div className="placeholder-mark">
        <BookOpen size={22} aria-hidden="true" />
      </div>
      <div>
        <p className="placeholder-title">{book.title}</p>
        <p className="placeholder-author">{book.authors[0] || 'Tampere library'}</p>
      </div>
    </div>
  )
}

function BookCard({ book, onSelect }: { book: Book; onSelect: (book: Book) => void }) {
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
      aria-label={`Open details for ${book.title}`}
    >
      <BookCover book={book} variant="card" />

      <div className="book-copy">
        <div>
          <h2>{book.title}</h2>
          <p className="authors">{book.authors.length ? book.authors.join(', ') : 'Unknown author'}</p>
        </div>

        <div className="meta-row">
          <Rating rating={book.rating} />
          {book.publicationYear ? <span>{book.publicationYear}</span> : null}
          {book.languages.slice(0, 2).map((language) => (
            <span key={language}>{LANGUAGE_LABELS[language] || language}</span>
          ))}
        </div>

        <div className="subjects">
          {book.subjects.slice(0, 4).map((subject) => (
            <span key={subject}>{subject}</span>
          ))}
        </div>

        <div className="branches">
          <strong>Tampere libraries</strong>
          {book.branches.length ? (
            book.branches.map((branch) => (
              <div className="branch-row" key={branch.code}>
                <span>{branch.branch}</span>
                <small>Listed</small>
              </div>
            ))
          ) : (
            <p>No Tampere branch detail returned.</p>
          )}
        </div>

        <span className="card-cta">View details</span>
      </div>
    </article>
  )
}

function BookDetailsPanel({
  book,
  detailState,
  onClose,
}: {
  book: Book
  detailState: { loading: boolean; error?: string; details?: BookDetails }
  onClose: () => void
}) {
  const details = detailState.details
  const displayBook = details ?? book

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="details-panel" role="dialog" aria-modal="true" aria-labelledby="book-details-title" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close details">
          <X size={20} aria-hidden="true" />
        </button>

        <BookCover book={displayBook} variant="detail" />

        <div className="details-main">
          <div className="details-heading">
            <h2 id="book-details-title">{displayBook.title}</h2>
            <p>{displayBook.authors.length ? displayBook.authors.join(', ') : 'Unknown author'}</p>
          </div>

          <div className="meta-row">
            <Rating rating={displayBook.rating} />
            {displayBook.publicationYear ? (
              <span>
                <Calendar size={14} aria-hidden="true" />
                {displayBook.publicationYear}
              </span>
            ) : null}
            {displayBook.isbns[0] ? (
              <span>
                <Hash size={14} aria-hidden="true" />
                {displayBook.isbns[0]}
              </span>
            ) : null}
          </div>

          {detailState.loading ? <p className="detail-muted">Loading more catalogue details...</p> : null}
          {detailState.error ? <p className="detail-error">{detailState.error}</p> : null}

          <DetailSection title="Description">
            <p>{details?.description || 'No description was found in Finna or Open Library for this edition.'}</p>
          </DetailSection>

          <DetailSection title="Libraries">
            <div className="library-list">
              {(details?.catalogueLibraries.length ? details.catalogueLibraries : displayBook.branches).map((library) => (
                <div className="library-item" key={library.code}>
                  <span>{library.branch}</span>
                  <strong>Listed in catalogue</strong>
                </div>
              ))}
              {!details?.catalogueLibraries.length && !displayBook.branches.length ? <p>No library presence details returned.</p> : null}
            </div>
          </DetailSection>

          <div className="detail-grid">
            <DetailList title="Publication" values={[...(details?.publicationInfo ?? []), ...(details?.publishers ?? [])]} />
            <DetailList title="Physical details" values={details?.physicalDescriptions ?? []} />
            <DetailList title="Series" values={details?.series ?? []} />
            <DetailList title="Languages" values={displayBook.languages.map((language) => LANGUAGE_LABELS[language] || language)} />
          </div>

          <DetailList title="Subjects" values={displayBook.subjects} compact />

          <a className="piki-link details-link" href={displayBook.pikiUrl} target="_blank" rel="noreferrer">
            Open in PIKI
            <ExternalLink size={16} aria-hidden="true" />
          </a>
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

function DetailList({ title, values, compact = false }: { title: string; values: string[]; compact?: boolean }) {
  if (!values.length) return null

  return (
    <DetailSection title={title}>
      <div className={compact ? 'subjects detail-tags' : 'detail-list'}>
        {values.map((value, index) => (
          <span key={`${value}-${index}`}>{value}</span>
        ))}
      </div>
    </DetailSection>
  )
}

function Rating({ rating }: { rating?: Book['rating'] }) {
  if (!rating) return <span className="muted-rating">No Open Library rating</span>

  return (
    <span className="rating">
      <Star size={15} fill="currentColor" aria-hidden="true" />
      {rating.value.toFixed(1)}
      <small>{rating.count} ratings</small>
    </span>
  )
}

function unique<T>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[]))
}

export default App
