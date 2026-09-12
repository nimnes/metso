type PagesContext = {
  request: Request
  params: {
    id?: string | string[]
  }
}

type FinnaRecord = {
  id: string
  title?: string
  authors?: Record<string, Record<string, unknown>>
  nonPresenterAuthors?: Array<{ name: string }>
  year?: string
  summary?: string[]
  images?: string[]
  isbns?: string[]
  cleanIsbn?: string
  recordPage?: string
  rawData?: {
    author?: string[]
    'callnumber-search'?: string[]
    'callnumber-raw'?: string[]
    isbn?: string[]
  }
}

type FinnaRecordResponse = {
  status: 'OK' | 'ERROR'
  records?: FinnaRecord[]
}

const FINNA_API_BASE = 'https://api.finna.fi/v1'
const PIKI_BASE = 'https://piki.finna.fi'

export async function onRequestGet({ request, params }: PagesContext): Promise<Response> {
  const id = normalizeId(Array.isArray(params.id) ? params.id[0] : params.id)
  if (!id) return new Response('Book id is required', { status: 400 })

  const requestUrl = new URL(request.url)
  const shareUrl = `${requestUrl.origin}/book/${encodeURIComponent(id)}`
  const appUrl = `${requestUrl.origin}/?book=${encodeURIComponent(id)}`

  try {
    const record = await getFinnaRecord(id)
    const imageUrl = await getShareImageUrl(record, requestUrl.origin)
    return htmlResponse(renderSharePage({ appUrl, imageUrl, record, shareUrl }))
  } catch {
    return htmlResponse(
      renderSharePage({
        appUrl,
        imageUrl: `${requestUrl.origin}/metso-icon-512.png`,
        record: {
          id,
          title: 'Metso',
          summary: ['Search books in Tampere PIKI libraries.'],
        },
        shareUrl,
      }),
    )
  }
}

async function getFinnaRecord(id: string): Promise<FinnaRecord> {
  const params = new URLSearchParams()
  params.set('id', id)
  const fields = ['id', 'title', 'authors', 'nonPresenterAuthors', 'year', 'summary', 'images', 'isbns', 'cleanIsbn', 'recordPage', 'rawData']
  fields.forEach((field) => params.append('field[]', field))

  const response = await fetch(`${FINNA_API_BASE}/record?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Finna request failed')

  const data = (await response.json()) as FinnaRecordResponse
  const record = data.records?.[0]
  if (data.status !== 'OK' || !record) throw new Error('Book not found')

  return record
}

function renderSharePage({ appUrl, imageUrl, record, shareUrl }: { appUrl: string; imageUrl: string; record: FinnaRecord; shareUrl: string }): string {
  const title = cleanText(record.title) || 'Metso'
  const author = cleanText(record.nonPresenterAuthors?.[0]?.name)
  const year = cleanText(record.year)
  const description = getDescription(record, author, year)
  const pikiUrl = record.recordPage ? `${PIKI_BASE}${record.recordPage}` : `${PIKI_BASE}/Record/${record.id}`

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} - Metso</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="book" />
    <meta property="og:site_name" content="Metso" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <link rel="canonical" href="${escapeHtml(shareUrl)}" />
    <script>window.location.replace(${JSON.stringify(appUrl)});</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <p><a href="${escapeHtml(appUrl)}">Open in Metso</a></p>
      <p><a href="${escapeHtml(pikiUrl)}">Open in PIKI</a></p>
    </main>
  </body>
</html>`
}

function getDescription(record: FinnaRecord, author?: string, year?: string): string {
  const summary = cleanText(record.summary?.[0])
  if (summary) return truncate(summary, 220)

  const parts = [author, year, 'available in Tampere PIKI libraries'].filter(Boolean)
  return parts.join('. ')
}

async function getShareImageUrl(record: FinnaRecord, origin: string): Promise<string> {
  const fallbackUrl = `${origin}/metso-icon-512.png`
  const isbns = normalizeIsbns([...(record.isbns ?? []), record.cleanIsbn].filter(Boolean) as string[])
  const candidates = unique([
    ...(record.images ?? []).map(normalizePikiUrl),
    buildPikiCoverUrl(record, isbns),
  ])

  for (const candidate of candidates) {
    if (await isRealCover(candidate)) return candidate
  }

  return fallbackUrl
}

async function isRealCover(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) return false

    const contentType = response.headers.get('content-type') ?? ''
    return !contentType.includes('image/gif')
  } catch {
    return false
  }
}

function buildPikiCoverUrl(record: FinnaRecord, isbns: string[]): string | undefined {
  const params = new URLSearchParams()
  const author = getAuthor(record) ?? cleanText(record.rawData?.author?.[0])
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

function getAuthor(record: FinnaRecord): string | undefined {
  const namedAuthor = cleanText(record.nonPresenterAuthors?.[0]?.name)
  if (namedAuthor) return namedAuthor

  return Object.values(record.authors ?? {})
    .flatMap((bucket) => Object.keys(bucket))
    .map(cleanText)
    .find(Boolean)
}

function normalizeIsbns(values: string[]): string[] {
  return unique(
    values
      .map((value) => value.match(/(?:97[89][-\s]?)?\d[-\d\s]{8,}[\dXx]/)?.[0] ?? '')
      .map((value) => value.replace(/[-\s]/g, '').toUpperCase())
      .filter((value) => value.length === 10 || value.length === 13),
  )
}

function normalizePikiUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${PIKI_BASE}${pathOrUrl}`
}

function normalizeId(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || !/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return undefined
  return trimmed
}

function cleanText(value?: string): string | undefined {
  const cleaned = (value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || undefined
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1).trim()}...` : value
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function unique<T>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[]))
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
