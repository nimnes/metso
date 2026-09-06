# Metso

Metso is a small web app for browsing books in Tampere city libraries. It uses the public Finna API for PIKI catalogue data and adds lightweight metadata from Open Library, Hardcover, and Kirjavälitys when available.

The goal is simple: make it easier to discover interesting books in nearby Tampere libraries, then open the official PIKI record when it is time to reserve or borrow.

## What It Does

- Search the Tampere PIKI catalogue by title, author, subject, or ISBN.
- Filter results by language, genre, library branch, and rating.
- Browse paginated book results with covers, authors, publication years, ratings, and library presence.
- Open a book details view with description, publication metadata, subjects, ISBN, and Tampere libraries.
- Open the official PIKI page for login, reservations, and live library actions.
- Switch the interface between English and Russian.

## Current Boundaries

Metso does not manage PIKI accounts, loans, renewals, reservations, or wishlists.

The public Finna API is used for catalogue discovery, but it does not currently provide all live copy-level loan statuses through the fields used by this app. For account actions and authoritative availability, users should continue to use the official PIKI page linked from each book.

## Tech Stack

- React
- TypeScript
- Vite
- Cloudflare Pages
- Cloudflare Pages Functions for server-side API calls that need a secret or proxy handling

## Data Sources

- **Finna / PIKI**: catalogue search, book details, PIKI links, covers, branches, subjects, genres, languages, publication metadata.
- **Open Library**: public ratings and cover fallback.
- **Hardcover**: optional second rating source, queried through a Cloudflare Pages Function.
- **Kirjavälitys**: description fallback for some ISBNs, queried through a Cloudflare Pages Function.

Ratings and descriptions are best-effort enrichments. Many books will not have public ratings.

## Local Development

Install dependencies:

```bash
npm install
```

Run the Vite dev server:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

Run linting:

```bash
npm run lint
```

## Local API Secrets

Hardcover enrichment needs an API token. Create a local `.dev.vars` file if you want to test it with Cloudflare Pages Functions:

```bash
HARDCOVER_API_TOKEN="your-token-here"
```

Do not commit `.dev.vars` or any other secret file.

To test the Cloudflare Pages build locally:

```bash
npm run build
npx wrangler pages dev dist
```

## Deployment

The project is deployed to Cloudflare Pages.

GitHub Actions deploys the app on pushes to `main` using:

- build command: `npm run build`
- output directory: `dist`
- Cloudflare Pages project: `metso`

The GitHub repository needs this Actions secret:

```text
CLOUDFLARE_API_TOKEN
```

The Cloudflare Pages project should also define this environment variable if Hardcover ratings are enabled:

```text
HARDCOVER_API_TOKEN
```

Without the Hardcover token, the app still works; it simply skips Hardcover enrichment.

## Project Structure

```text
src/
  api/        API adapters and enrichment helpers
  data/       curated filter data
  App.tsx     main application UI
  i18n.ts     English and Russian UI text

functions/
  api/        Cloudflare Pages Functions

.github/
  workflows/ GitHub Actions deployment
```

## Contributing

Before opening a pull request, please run:

```bash
npm run lint
npm run build
```

Keep changes small and focused where possible. The app intentionally favors a quiet catalogue-style interface over a marketing-style landing page.

When adding a new external data source, avoid putting API keys in browser code. Use a Cloudflare Pages Function for anything that needs a secret.
