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
  recordPage?: string
  rawData?: {
    title_alt?: string[]
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
    const imageUrl = getShareImageUrl(record, requestUrl.origin)
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
  const fields = ['id', 'title', 'authors', 'nonPresenterAuthors', 'year', 'summary', 'recordPage', 'rawData']
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
  const title = getDisplayTitle(record)
  const author = getAuthor(record)
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
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="768" />
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

function getDisplayTitle(record: FinnaRecord): string {
  return record.rawData?.title_alt?.map(cleanText).find((title) => /[А-Яа-яЁё]/.test(title)) || cleanText(record.title) || 'Metso'
}

function getShareImageUrl(record: FinnaRecord, origin: string): string {
  return `${origin}/api/book-cover?id=${encodeURIComponent(record.id)}`
}

function getAuthor(record: FinnaRecord): string | undefined {
  const namedAuthor = cleanText(record.nonPresenterAuthors?.[0]?.name)
  if (namedAuthor) return namedAuthor

  return Object.values(record.authors ?? {})
    .flatMap((bucket) => Object.keys(bucket))
    .map(cleanText)
    .find(Boolean)
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

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
