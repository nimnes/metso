import { getBookCoverResponse } from '../api/book-cover'

type PagesContext = {
  request: Request
  params: {
    file?: string | string[]
  }
}

export async function onRequest({ request, params }: PagesContext): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    })
  }

  const filename = Array.isArray(params.file) ? params.file[0] : params.file
  const id = normalizePreviewImageId(filename)
  if (!id) return new Response('Book id is required', { status: 400 })

  return getBookCoverResponse(id, request.method !== 'HEAD')
}

function normalizePreviewImageId(filename?: string): string | undefined {
  const id = filename?.replace(/\.jpe?g$/i, '').trim()
  if (!id || !/^[A-Za-z0-9_.:-]+$/.test(id)) return undefined

  return id
}
