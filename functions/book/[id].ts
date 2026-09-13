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

type PreviewOverrides = {
  title?: string
  author?: string
  year?: string
  imageUrl?: string
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
  [/yi\b/g, 'ый'],
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
const COMMON_WORDS: Record<string, string> = {
  den: 'день',
  doma: 'дома',
  eda: 'еда',
  edim: 'едим',
  etot: 'этот',
  eta: 'эта',
  eto: 'это',
  kazhdyi: 'каждый',
  kazhdyj: 'каждый',
  vse: 'все',
  vsjo: 'всё',
  vsego: 'всего',
}
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

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return renderBookShareResponse(context)
}

export async function renderBookShareResponse({ request, params }: PagesContext): Promise<Response> {
  const id = normalizeId(Array.isArray(params.id) ? params.id[0] : params.id)
  if (!id) return new Response('Book id is required', { status: 400 })

  const requestUrl = new URL(request.url)
  const shareUrl = `${requestUrl.origin}${requestUrl.pathname}${requestUrl.search}`
  const appUrl = `${requestUrl.origin}/?book=${encodeURIComponent(id)}`
  const preview = getPreviewOverrides(requestUrl)

  try {
    const record = preview.title ? getPreviewRecord(id, preview) : await getFinnaRecord(id)
    const imageUrl = preview.imageUrl ?? getShareImageUrl(record, requestUrl.origin, requestUrl.searchParams.get('v'))
    return htmlResponse(renderSharePage({ appUrl, imageUrl, record, shareUrl }))
  } catch {
    const fallbackRecord = getPreviewRecord(id, preview)
    return htmlResponse(
      renderSharePage({
        appUrl,
        imageUrl: preview.imageUrl ?? `${requestUrl.origin}/metso-icon-512.png`,
        record: fallbackRecord,
        shareUrl,
      }),
    )
  }
}

function getPreviewOverrides(url: URL): PreviewOverrides {
  const imageUrl = cleanShareImageUrl(url.searchParams.get('img'))

  return {
    title: cleanText(url.searchParams.get('t') ?? undefined),
    author: cleanText(url.searchParams.get('a') ?? undefined),
    year: cleanText(url.searchParams.get('y') ?? undefined),
    imageUrl,
  }
}

function getPreviewRecord(id: string, preview: PreviewOverrides): FinnaRecord {
  const summary = [preview.author, preview.year, 'available in Tampere PIKI libraries'].filter(Boolean).join('. ')

  return {
    id,
    title: preview.title || 'Metso',
    nonPresenterAuthors: preview.author ? [{ name: preview.author }] : undefined,
    year: preview.year,
    summary: [summary || 'Search books in Tampere PIKI libraries.'],
    recordPage: `/Record/${id}`,
  }
}

function cleanShareImageUrl(value: string | null): string | undefined {
  if (!value) return undefined

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
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

function renderSharePage({
  appUrl,
  imageUrl,
  record,
  shareUrl,
}: {
  appUrl: string
  imageUrl: string
  record: FinnaRecord
  shareUrl: string
}): string {
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
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Metso" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:alt" content="${escapeHtml(title)} cover" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <link rel="canonical" href="${escapeHtml(shareUrl)}" />
    <style>
      body {
        margin: 0;
        background: #faf7f1;
        color: #11181c;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        box-sizing: border-box;
        display: grid;
        gap: 20px;
        max-width: 760px;
        min-height: 100vh;
        padding: 32px;
      }
      img {
        width: min(260px, 60vw);
        border-radius: 10px;
        box-shadow: 0 18px 40px rgba(22, 32, 29, 0.15);
      }
      h1 {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(2rem, 7vw, 4rem);
        line-height: 1;
      }
      p {
        margin: 0;
        color: #52605f;
        font-size: 1.15rem;
        line-height: 1.5;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      a {
        color: #116f55;
        font-weight: 700;
      }
      nav a {
        border: 1px solid #cbd9d5;
        border-radius: 8px;
        padding: 10px 14px;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)} cover" />
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <nav>
        <a href="${escapeHtml(appUrl)}">Open in Metso</a>
        <a href="${escapeHtml(pikiUrl)}">Open in PIKI</a>
      </nav>
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

function getShareImageUrl(record: FinnaRecord, origin: string, version?: string | null): string {
  const params = new URLSearchParams()
  if (version) params.set('v', version)

  const query = params.toString()
  return `${origin}/preview-image/${encodeURIComponent(record.id)}.jpg${query ? `?${query}` : ''}`
}

function getAuthor(record: FinnaRecord): string | undefined {
  const isRussian = record.languages?.[0] === 'rus'
  const namedAuthor = getDisplayAuthorName(record.nonPresenterAuthors?.[0], isRussian)
  if (namedAuthor) return namedAuthor

  return Object.values(record.authors ?? {})
    .flatMap((bucket) => Object.keys(bucket))
    .map((author) => getDisplayAuthorName({ name: author }, isRussian))
    .find(Boolean)
}

function getDisplayAuthorName(author: { name: string; name_alt?: string } | undefined, isRussian: boolean): string | undefined {
  const nativeName = cleanText(author?.name_alt)
  if (nativeName && /[А-Яа-яЁё]/.test(nativeName)) return nativeName

  const normalizedName = cleanText(author?.name)
  return isRussian ? (getRussianTitleFallback(normalizedName) ?? normalizedName) : normalizedName
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
  const commonWord = COMMON_WORDS[value]
  if (commonWord) return capitalized ? capitalizeReplacement(commonWord) : commonWord

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
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
