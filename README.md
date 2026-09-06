# Project brief: Tampere / PIKI book discovery web app

I want to build a lightweight web application for browsing books available in Tampere libraries using PIKI/Finna data.

## Main goal

Create a nicer discovery interface than the standard PIKI catalogue, focused on questions like:

* What good books are available in Tampere right now?
* Which library branch has a copy available?
* Can I filter by language, rating, genre, author, etc.?
* Can I see the book cover and an external rating?

The app should ideally run with no paid hosting.

## Preferred architecture

Use a static frontend hosted for free, preferably:

* Cloudflare Pages, or
* GitHub Pages

Avoid maintaining a backend/database unless it becomes necessary.

Finna supports browser access/CORS, so the frontend should query public APIs directly where practical.

## Data sources

### 1. PIKI / Finna

Use the Finna API as the primary catalogue source.

PIKI libraries in Tampere are exposed through Finna.

Need to investigate and use:

* title
* author
* ISBN
* edition
* publication year
* language
* subjects / genres
* format
* book cover / thumbnail
* holdings
* individual Tampere library branches
* current availability / loan status

Important: determine exactly what the API exposes for item-level availability.

Ideally the UI should be able to show something like:

* Metso — Available
* Hervanta — On loan
* Sampola — Available
* Tesoma — In transit

Also investigate whether Finna exposes:

* due date / expected return
* number of available copies
* total copies
* reservation queue
* item location / shelf
* individual copy status

PIKI/Finna should be the authoritative source for availability.

## 2. Open Library and Hardcover

Use Open Library and Hardcover as parallel rating enrichment sources. Open Library remains the primary description/metadata enrichment source, while Hardcover can add a second rating and cover fallback.

Primary matching should be by ISBN.

Flow:

PIKI record
→ ISBN
→ Open Library edition
→ parent Work
→ rating / additional metadata

Fallbacks:

* Open Library normalized title + author search
* Hardcover ISBN search for an additional rating
* Hardcover title search when ISBN lookup is not possible

Open Library supports Russian-language books and Cyrillic metadata, so the app should support Finnish, English and Russian books.

Important caveat: Open Library and Hardcover rating coverage is still weaker than Goodreads.

Do not assume every book has a useful rating.

## Ratings

Goodreads would be preferable from a user perspective, but Goodreads does not provide a usable public API for new applications.

Do not build the app around Goodreads scraping.

For MVP:

* display Open Library and Hardcover rating slots side by side
* show `--` for a source when that source has no rating
* display rating source with compact source marks, e.g. `OL` or `H`
* allow books without ratings

Potential future task: investigate another legitimate free ratings source with better coverage.

## Covers

Preferred cover selection:

1. Finna/PIKI cover first

   * more likely to correspond to the actual PIKI edition
2. Open Library cover by ISBN as fallback
3. generic "No cover" placeholder

Open Library cover API pattern:

https://covers.openlibrary.org/b/isbn/{ISBN}-M.jpg

Use `?default=false` where useful to detect missing images.

Do not make excessive ISBN cover requests if avoidable; once an Open Library record is resolved, prefer stable Open Library identifiers/cover IDs.

## MVP UI

I want a clean book-discovery interface.

Book card example:

[cover]

Мастер и Маргарита
Михаил Булгаков

★ 4.3 Open Library

Russian · Fiction · 1967

Metso       Available
Hervanta    On loan
Sampola     Available

[Open in PIKI]

Useful filters:

* Available now
* Tampere libraries only
* branch

  * Metso
  * Hervanta
  * Sampola
  * Tesoma
  * etc.
* language

  * Finnish
  * English
  * Russian
* format
* author
* subject / genre
* publication year
* rating threshold

Useful sorting:

* relevance
* rating
* newest
* oldest
* title
* availability

Potential discovery view:

"Highly rated books available now"

This is an important use case.

## Technical preferences

Keep the initial implementation simple.

Suggested stack:

* React
* TypeScript
* Vite

Possible alternatives are fine if there is a strong reason.

Avoid unnecessary frameworks/services.

Client-side caching:

* localStorage or IndexedDB for Open Library / Hardcover enrichment cache
* cache ISBN → rating/cover mapping
* avoid hammering external APIs

The application should remain usable if Open Library or Hardcover is temporarily unavailable; PIKI search/availability should still work.

## API handling

Create clean adapters rather than coupling UI directly to raw API responses.

Suggested modules:

* `finna.ts`
* `openLibrary.ts`
* `hardcover.ts`
* `bookNormalizer.ts`
* `availability.ts`

Normalize both APIs into a common internal type, for example:

```ts
type Book = {
  id: string
  finnaId: string

  title: string
  subtitle?: string
  authors: string[]

  isbn?: string[]
  languages: string[]
  publicationYear?: number

  subjects: string[]
  formats: string[]

  coverUrl?: string

  rating?: {
    value: number
    count?: number
    source: "openlibrary" | "hardcover"
  }

  availability: LibraryAvailability[]

  finnaUrl?: string
}
```

and:

```ts
type LibraryAvailability = {
  branch: string
  status: "available" | "on-loan" | "in-transit" | "unknown"
  availableCopies?: number
  totalCopies?: number
}
```

Adjust these types after inspecting the real Finna response.

## First development task

Before building much UI, investigate the live Finna API using several actual PIKI/Tampere books and answer:

1. How do we restrict searches to PIKI?
2. How do we restrict/filter holdings to Tampere?
3. How are individual branches represented?
4. What exact availability fields are returned?
5. Can we get copy-level status?
6. Is due-date information exposed?
7. Does Finna return a usable cover URL?
8. What identifier should be used for deep linking back to PIKI?
9. What pagination/search limits apply?
10. Are there any restrictions relevant to a public static app?

Test multiple scenarios:

* common English book
* Finnish book
* Russian book
* book with multiple editions
* book currently available
* book where all copies are on loan

Then document the findings before implementing the full catalogue UI.

## Second task

Test Open Library enrichment on a sample of roughly 20–30 PIKI books across:

* Finnish
* English
* Russian

Measure:

* ISBN match rate
* work match rate
* cover availability
* rating availability
* rating count quality

This will tell us whether Open Library ratings are useful enough for the MVP.

## Deployment goal

The finished MVP should be deployable with:

* no paid backend
* no paid database
* no API secrets in the frontend
* no mandatory account/login

Target ongoing cost: €0/month.

## Account and reservations boundary

Loan status, current loans, reservations and favourites are account-sensitive PIKI features. The app should not collect or store PIKI library-card numbers or PIN codes in the static frontend.

Recommended phase split:

* Phase 1: keep discovery in this app, show Tampere catalogue presence from public Finna data, and link users to the official PIKI record page for live availability, login and reservations.
* Phase 2: add a Cloudflare Worker only if there is an approved PIKI/Finna authentication path for third-party clients, or if PIKI provides a stable endpoint intended for availability/reservation integration.

Current safe handoff link:

* Book page in PIKI: `${recordPage}`

## MVP implementation notes

This repository now contains a React + TypeScript + Vite static app. It is designed for Cloudflare Pages or GitHub Pages and does not require a backend, database, or API secret for the current public catalogue/rating flow.

Useful commands:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run build && npx wrangler pages dev dist
```

For Cloudflare Pages:

* Build command: `npm run build`
* Output directory: `dist`
* Environment variables:
  * `HARDCOVER_API_TOKEN`: secret Hardcover API token for server-side Hardcover enrichment

Hardcover notes:

* Hardcover is queried independently from Open Library so both ratings can be shown when available.
* Hardcover requests go through the Cloudflare Pages Function at `/api/hardcover`.
* The Hardcover token must be stored as a Cloudflare secret, not as a Vite `VITE_` browser variable.
* For local Cloudflare Pages Functions development, put `HARDCOVER_API_TOKEN="..."` in `.dev.vars` and do not commit that file.
* Plain tokens and `Bearer ...` values are both accepted.
* A `204 No Content` response from `/api/hardcover` means the app is silently falling back because Hardcover could not provide enrichment. To see why locally, add `debug=1` to the request:

```bash
curl "http://127.0.0.1:8788/api/hardcover?isbn=9780141439600&title=Pride%20and%20Prejudice&debug=1"
```

`{"reason":"missing-token"}` means Wrangler is not seeing `HARDCOVER_API_TOKEN`. `{"reason":"no-match"}` means the token is loaded, but Hardcover did not find a matching book.

## Live API findings as of 2026-08-31

Sources checked:

* Finna API documentation: https://www.kiwi.fi/spaces/Finna/pages/53839221/Finna+API+in+English
* Finna OpenAPI schema: https://api.finna.fi/api/v1/?openapi
* PIKI search help: https://piki.finna.fi/Content/info_search?lng=en-gb
* Open Library ISBN and rating endpoints: `https://openlibrary.org/isbn/{isbn}.json`, `https://openlibrary.org/works/{workId}/ratings.json`
* Hardcover GraphQL endpoint: `https://api.hardcover.app/v1/graphql`

Findings:

1. Restricting to PIKI works with Finna filters like `filter[]=building:"0/Piki/"`.
2. Restricting to Tampere works with `filter[]=building:"1/Piki/1/"`.
3. Restricting to Tampere City Library holdings works with `filter[]=building:"2/Piki/1/1/"`.
4. Public Finna `search` and `record` responses expose `buildings`, `formats`, `images`, `languages`, `subjects`, `isbns`, `cleanIsbn`, `recordPage`, and similar bibliographic fields.
5. The public Finna API schema does not expose a `holdings` or `availability` field for item-level copy status.
6. The public endpoint did not return real-time statuses such as available, on loan, in transit, due date, total copies, available copies, shelf location, or reservation queue in the tested calls.
7. Finna cover URLs are returned as relative `images` paths. The app prefixes them with `https://piki.finna.fi`.
8. PIKI deep links can be built from `recordPage`, for example `https://piki.finna.fi/Record/piki.4440048`.
9. Finna states that CORS is supported for all origins. The API is read-only and not intended for large result-set downloads.
10. Open Library rating enrichment works best by ISBN: edition lookup -> parent work -> `/ratings.json`. Hardcover can provide `rating` and `ratings_count` for some records as a second rating source. Rating coverage is inconsistent, so the UI treats ratings as optional.

Important product implication:

The MVP currently shows catalogue presence from Finna, not live borrowing availability. Real branch-level availability and borrowing will probably need either an authenticated PIKI integration, a separate availability endpoint, or a careful investigation of what the PIKI web UI calls behind the scenes. Borrowing and account login should stay in phase 2.

### Tampere district library filters

The library selector is intentionally Tampere-only for the MVP. The default filter uses Finna's Tampere city building value:

* `building:"1/Piki/1/"`

District library options use indexed PIKI holding codes such as:

* `holdings_txtP_mv:"1 001 piki"` for Main Library Metso
* `holdings_txtP_mv:"1 003 piki"` for Sampola
* `holdings_txtP_mv:"1 013 piki"` for Tesoma

These holding-code filters are useful for narrowing the catalogue, but they are still not the same as live copy-level availability. Exact live branch/copy status remains a phase 2 topic.

### Account/API findings as of 2026-09-01

* The live Finna OpenAPI schema describes the REST API as a read-only interface and exposes public paths for `/search`, `/record`, `/authority/search` and `/authority/record`.
* The documented Finna library-card authentication endpoint exists in older/current documentation, but live requests to `https://api.finna.fi/api/v1/auth/getLoginTargets` and `https://piki.finna.fi/api/v1/auth/getLoginTargets` returned `Permission denied` during testing.
* Finna help says logged-in users can browse account information, renew loans, reserve library material and create favourites, but this is via Finna/PIKI account flows.
* Finna reservation help says reservations require being logged in and having a connected library card.
* PIKI record pages expose a Holdings page, but the public REST API does not expose the same copy-level status as a stable JSON field.
