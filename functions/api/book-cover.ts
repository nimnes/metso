type PagesContext = {
  request: Request
}

type FinnaRecord = {
  id: string
  title?: string
  authors?: Record<string, Record<string, unknown>>
  nonPresenterAuthors?: Array<{ name: string }>
  images?: string[]
  isbns?: string[]
  cleanIsbn?: string
  rawData?: {
    author?: string[]
    'callnumber-search'?: string[]
    'callnumber-raw'?: string[]
    isbn?: string[]
    url?: string[]
  }
}

type FinnaRecordResponse = {
  status: 'OK' | 'ERROR'
  records?: FinnaRecord[]
}

const FINNA_API_BASE = 'https://api.finna.fi/v1'
const PIKI_BASE = 'https://piki.finna.fi'

export async function onRequestGet({ request }: PagesContext): Promise<Response> {
  const requestUrl = new URL(request.url)
  const id = normalizeId(requestUrl.searchParams.get('id') ?? undefined)
  if (!id) return new Response('Book id is required', { status: 400 })

  try {
    const record = await getFinnaRecord(id)
    const cover = await getCoverResponse(record)
    if (cover) return cover
  } catch {
    // Fall through to the app icon.
  }

  return Response.redirect(`${requestUrl.origin}/metso-icon-512.png`, 302)
}

async function getFinnaRecord(id: string): Promise<FinnaRecord> {
  const params = new URLSearchParams()
  params.set('id', id)
  const fields = ['id', 'title', 'authors', 'nonPresenterAuthors', 'images', 'isbns', 'cleanIsbn', 'rawData']
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

async function getCoverResponse(record: FinnaRecord): Promise<Response | undefined> {
  const isbns = normalizeIsbns([...(record.isbns ?? []), record.cleanIsbn].filter(Boolean) as string[])
  const candidates = unique([
    ...(record.images ?? []).map(normalizePikiUrl),
    buildPikiCoverUrl(record, isbns),
    ...getRawCoverUrls(record),
  ])

  for (const candidate of candidates) {
    const response = await fetch(candidate, { headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' } })
    if (!response.ok || !response.body) continue

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/') || contentType.includes('image/gif')) continue

    return new Response(response.body, {
      headers: {
        'Cache-Control': 'public, max-age=604800',
        'Content-Type': contentType,
      },
    })
  }

  return undefined
}

function getRawCoverUrls(record: FinnaRecord): string[] {
  return (record.rawData?.url ?? []).filter((url) => /format=image|\/cover\//i.test(url))
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

function unique<T>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[]))
}
