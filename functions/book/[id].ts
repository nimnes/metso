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
  nonPresenterAuthors?: Array<{ name: string; name_alt?: string }>
  year?: string
  languages?: string[]
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
const CYRILLIC_PATTERN = /[А-Яа-яЁё]/
const MULTI_LETTER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/shch/g, 'щ'],
  [/štš/g, 'щ'],
  [/tš/g, 'ч'],
  [/tsch/g, 'ч'],
  [/ts/g, 'ц'],
  [/zh/g, 'ж'],
  [/ž/g, 'ж'],
  [/sh/g, 'ш'],
  [/š/g, 'ш'],
  [/č/g, 'ч'],
  [/kh/g, 'х'],
  [/â/g, 'я'],
  [/û/g, 'ю'],
  [/ë/g, 'ё'],
  [/ij\b/g, 'ий'],
  [/yj\b/g, 'ый'],
  [/ja/g, 'я'],
  [/ya/g, 'я'],
  [/ju/g, 'ю'],
  [/yu/g, 'ю'],
  [/jo/g, 'ё'],
  [/yo/g, 'ё'],
  [/je/g, 'е'],
  [/ye/g, 'е'],
]
const LETTER_MAP: Record<string, string> = {
  a: 'а',
  b: 'б',
  c: 'к',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'х',
  i: 'и',
  j: 'й',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  w: 'в',
  x: 'кс',
  y: 'ы',
  z: 'з',
  ä: 'я',
}

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
  const fields = ['id', 'title', 'authors', 'nonPresenterAuthors', 'year', 'languages', 'summary', 'recordPage', 'rawData']
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
  const cyrillicTitle = record.rawData?.title_alt?.map(cleanText).find((title) => /[А-Яа-яЁё]/.test(title))
  const fallbackTitle = record.languages?.[0] === 'rus' ? getRussianTitleFallback(record.title) : undefined
  return cyrillicTitle || fallbackTitle || cleanText(record.title) || 'Metso'
}

function getShareImageUrl(record: FinnaRecord, origin: string): string {
  return `${origin}/api/book-cover?id=${encodeURIComponent(record.id)}`
}

function getAuthor(record: FinnaRecord): string | undefined {
  const namedAuthor = getDisplayAuthorName(record.nonPresenterAuthors?.[0])
  if (namedAuthor) return namedAuthor

  return Object.values(record.authors ?? {})
    .flatMap((bucket) => Object.keys(bucket))
    .map(cleanText)
    .find(Boolean)
}

function getDisplayAuthorName(author?: { name: string; name_alt?: string }): string | undefined {
  const nativeName = cleanText(author?.name_alt)
  return nativeName && /[А-Яа-яЁё]/.test(nativeName) ? nativeName : cleanText(author?.name)
}

function getRussianTitleFallback(title?: string): string | undefined {
  const cleaned = title?.replace(/\s+/g, ' ').trim()
  if (!cleaned || CYRILLIC_PATTERN.test(cleaned)) return undefined

  const transliterated = cleaned.replace(/[A-Za-zšžčŠŽČâûëÂÛËäÄ]+/g, transliterateWord).replace(/\s+([:;,.!?])/g, '$1')
  return CYRILLIC_PATTERN.test(transliterated) ? transliterated : undefined
}

function transliterateWord(word: string): string {
  const capitalized = /^[A-ZŠŽČÂÛËÄ]/.test(word)
  let value = word.toLocaleLowerCase()

  value = value.replace(/([bcdfghjklmnpqrstvwxzšžč])j([eё])/g, '$1ь$2')
  for (const [pattern, replacement] of MULTI_LETTER_REPLACEMENTS) {
    value = value.replace(pattern, replacement)
  }

  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const letter = value[index]
    if (letter === 'e' && index === 0) {
      result += 'э'
    } else {
      result += LETTER_MAP[letter] ?? letter
    }
  }

  return capitalized ? result.charAt(0).toLocaleUpperCase() + result.slice(1) : result
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
