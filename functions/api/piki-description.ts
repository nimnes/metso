type PagesContext = {
  request: Request
}

const KIRJAVALITYS_DESCRIPTION_URL = 'http://data.kirjavalitys.fi/data/servlets/ProductRequestServlet'

export async function onRequestGet({ request }: PagesContext): Promise<Response> {
  const url = new URL(request.url)
  const isbn = normalizeIsbn(url.searchParams.get('isbn') ?? undefined)
  if (!isbn) return Response.json({ error: 'Valid ISBN is required' }, { status: 400 })

  const sourceUrl = new URL(KIRJAVALITYS_DESCRIPTION_URL)
  sourceUrl.searchParams.set('action', 'showreferat')
  sourceUrl.searchParams.set('ISBN', isbn)

  const response = await fetch(sourceUrl.toString(), {
    headers: {
      Accept: 'text/html,text/plain',
    },
  })
  if (!response.ok) return emptyResponse()

  const description = cleanText(await decodeResponseText(response))
  if (!description) return emptyResponse()

  return Response.json(
    { description },
    {
      headers: {
        'Cache-Control': 'public, max-age=604800',
      },
    },
  )
}

function normalizeIsbn(value?: string): string | undefined {
  const normalized = value?.replace(/[-\s]/g, '').toUpperCase()
  if (!normalized || (normalized.length !== 10 && normalized.length !== 13)) return undefined
  if (!/^(?:97[89])?[0-9]{9}[0-9X]$/.test(normalized)) return undefined
  return normalized
}

function cleanText(value: string): string | undefined {
  const cleaned = value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return cleaned || undefined
}

async function decodeResponseText(response: Response): Promise<string> {
  const charset = response.headers.get('content-type')?.match(/charset=([^;]+)/i)?.[1]?.trim()
  const bytes = await response.arrayBuffer()

  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes)
    } catch {
      // Fall back below when the server reports an unsupported charset label.
    }
  }

  return new TextDecoder().decode(bytes)
}

function emptyResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'X-Metso-Piki-Description-Status': 'not-found',
    },
  })
}
