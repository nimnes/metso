type Env = {
  HARDCOVER_API_TOKEN?: string
}

type PagesContext = {
  request: Request
  env: Env
}

type HardcoverGraphQlResponse = {
  data?: {
    editions?: Array<{ book?: HardcoverBook | null }>
    books?: HardcoverBook[]
  }
  errors?: Array<{ message?: string }>
}

type HardcoverBook = {
  id?: number
  title?: string
  slug?: string
  description?: string | null
  rating?: number
  ratings_count?: number
  image?: {
    url?: string
  } | null
}

const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql'

const ISBN_QUERY = `
  query BookByIsbn($isbn: String!) {
    editions(
      where: {
        _or: [
          { isbn_10: { _eq: $isbn } }
          { isbn_13: { _eq: $isbn } }
        ]
      }
      limit: 1
    ) {
      book {
        id
        title
        slug
        description
        rating
        ratings_count
        image {
          url
        }
      }
    }
  }
`

const TITLE_QUERY = `
  query BookByTitle($title: String!) {
    books(where: { title: { _ilike: $title } }, limit: 1) {
      id
      title
      slug
      description
      rating
      ratings_count
      image {
        url
      }
    }
  }
`

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const token = normalizeBearerToken(env.HARDCOVER_API_TOKEN)
  const url = new URL(request.url)
  const debug = url.searchParams.get('debug') === '1'
  if (!token) return emptyResponse('missing-token', debug)

  const isbn = url.searchParams.get('isbn')?.trim()
  const title = url.searchParams.get('title')?.trim()
  if (!isbn && !title) return Response.json({ error: 'ISBN or title is required' }, { status: 400 })

  const book = isbn ? await queryBook(token, ISBN_QUERY, { isbn }) : undefined
  const fallbackBook = book ?? (title ? await queryBook(token, TITLE_QUERY, { title: `%${title}%` }) : undefined)
  if (!fallbackBook) return emptyResponse('no-match', debug)

  const rating = typeof fallbackBook.rating === 'number' && fallbackBook.ratings_count ? fallbackBook.rating : undefined
  const body = {
    rating: rating
      ? {
          value: rating,
          count: fallbackBook.ratings_count ?? 0,
          source: 'hardcover',
        }
      : undefined,
    coverUrl: fallbackBook.image?.url,
    description: cleanText(fallbackBook.description ?? undefined),
    hardcoverUrl: fallbackBook.slug ? `https://hardcover.app/books/${fallbackBook.slug}` : undefined,
  }

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

async function queryBook(token: string, query: string, variables: Record<string, string>): Promise<HardcoverBook | undefined> {
  const response = await fetch(HARDCOVER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) return undefined

  const result = (await response.json()) as HardcoverGraphQlResponse
  if (result.errors?.length) return undefined

  return result.data?.editions?.[0]?.book ?? result.data?.books?.[0]
}

function emptyResponse(reason: 'missing-token' | 'no-match', debug: boolean): Response {
  if (debug) {
    return Response.json({ reason }, { status: 200 })
  }

  return new Response(null, {
    status: 204,
    headers: {
      'X-Metso-Hardcover-Status': reason,
    },
  })
}

function normalizeBearerToken(token?: string): string | undefined {
  const trimmed = token?.trim()
  if (!trimmed) return undefined
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed : `Bearer ${trimmed}`
}

function cleanText(value?: string): string | undefined {
  const cleaned = (value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return cleaned || undefined
}
