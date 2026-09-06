import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'metso-local-piki-description',
      configureServer(server) {
        server.middlewares.use('/api/piki-description', async (request, response) => {
          const requestUrl = new URL((request as { url?: string }).url ?? '', 'http://localhost')
          const isbn = normalizeIsbn(requestUrl.searchParams.get('isbn') ?? undefined)

          if (!isbn) {
            response.statusCode = 400
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'Valid ISBN is required' }))
            return
          }

          const sourceUrl = new URL('http://data.kirjavalitys.fi/data/servlets/ProductRequestServlet')
          sourceUrl.searchParams.set('action', 'showreferat')
          sourceUrl.searchParams.set('ISBN', isbn)

          try {
            const sourceResponse = await fetch(sourceUrl)
            const description = sourceResponse.ok ? cleanText(await decodeResponseText(sourceResponse)) : undefined

            if (!description) {
              response.statusCode = 204
              response.end()
              return
            }

            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ description }))
          } catch {
            response.statusCode = 204
            response.end()
          }
        })
      },
    },
  ],
})

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
