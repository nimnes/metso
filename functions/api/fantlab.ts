type PagesContext = {
  request: Request
}

type FantLabEditionSearchResult = {
  edition_id?: number
}

type FantLabEdition = {
  edition_work_id?: number | null
}

type FantLabWorkSearchResult = {
  all_autor_name?: string
  all_autor_rusname?: string
  markcount?: number
  midmark?: number[]
  midmark_by_weight?: number[]
  rating?: number[]
  rusname?: string
  name?: string
  weight?: number
  work_id?: number
}

type FantLabWork = {
  rating?: {
    rating?: number | string
    true_rating?: number | string
    voters?: number | string
  }
  val_midmark_by_weight?: number | string
  val_voters?: number | string
  work_id?: number
}

const FANTLAB_API_BASE = 'https://api.fantlab.ru'

export async function onRequestGet({ request }: PagesContext): Promise<Response> {
  const url = new URL(request.url)
  const isbn = normalizeIsbn(url.searchParams.get('isbn') ?? undefined)
  const title = url.searchParams.get('title')?.trim()
  const author = url.searchParams.get('author')?.trim()
  if (!isbn && !title) return Response.json({ error: 'ISBN or title is required' }, { status: 400 })

  try {
    const workId = (isbn ? await findWorkIdByIsbn(isbn) : undefined) ?? (title ? await findWorkIdBySearch(title, author) : undefined)
    if (!workId) return emptyResponse()

    const rating = await getWorkRating(workId)
    if (!rating) return emptyResponse()

    return Response.json(
      {
        rating,
        fantlabUrl: `https://fantlab.ru/work${workId}?page=1`,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=604800',
        },
      },
    )
  } catch {
    return emptyResponse()
  }
}

async function findWorkIdByIsbn(isbn: string): Promise<number | undefined> {
  const editions = await getJson<FantLabEditionSearchResult[]>(`/search-editions?q=${encodeURIComponent(isbn)}&onlymatches=1`)
  const editionId = editions?.[0]?.edition_id
  if (!editionId) return undefined

  const edition = await getJson<FantLabEdition>(`/edition/${editionId}`)
  return normalizeId(edition?.edition_work_id)
}

async function findWorkIdBySearch(title: string, author?: string): Promise<number | undefined> {
  const query = [title, author].filter(Boolean).join(' ')
  const matches = await getJson<FantLabWorkSearchResult[]>(`/search-works?q=${encodeURIComponent(query)}&onlymatches=1`)
  const bestMatch = (matches ?? [])
    .filter((match) => normalizeId(match.work_id))
    .map((match) => ({ match, score: scoreWorkMatch(match, title, author) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]?.match

  return normalizeId(bestMatch?.work_id)
}

async function getWorkRating(workId: number): Promise<{ value: number; count: number; source: 'fantlab' } | undefined> {
  const work = await getJson<FantLabWork>(`/work/${workId}`)
  const value = normalizeNumber(work?.rating?.rating) ?? normalizeNumber(work?.rating?.true_rating) ?? normalizeNumber(work?.val_midmark_by_weight)
  const count = normalizeNumber(work?.rating?.voters) ?? normalizeNumber(work?.val_voters)
  if (!value || !count) return undefined

  return {
    value,
    count: Math.round(count),
    source: 'fantlab',
  }
}

async function getJson<T>(path: string): Promise<T | undefined> {
  const response = await fetch(`${FANTLAB_API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return undefined

  return (await response.json()) as T
}

function scoreWorkMatch(match: FantLabWorkSearchResult, title: string, author?: string): number {
  const normalizedTitle = normalizeText(title)
  const candidateTitles = [match.rusname, match.name].map(normalizeText)
  const titleScore = candidateTitles.some((candidate) => candidate === normalizedTitle)
    ? 10
    : candidateTitles.some((candidate) => candidate.includes(normalizedTitle) || normalizedTitle.includes(candidate))
      ? 5
      : 0
  if (!titleScore) return 0

  const normalizedAuthor = normalizeText(author)
  const candidateAuthors = normalizeText([match.all_autor_rusname, match.all_autor_name].filter(Boolean).join(' '))
  const authorScore = !normalizedAuthor || candidateAuthors.includes(normalizedAuthor) ? 6 : 0
  const ratingWeight = Math.min(normalizeNumber(match.markcount) ?? 0, 1000) / 1000
  const searchWeight = Math.min(normalizeNumber(match.weight) ?? 0, 20000) / 20000

  return titleScore + authorScore + ratingWeight + searchWeight
}

function normalizeText(value?: string): string {
  return (value ?? '')
    .toLocaleLowerCase('ru')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9а-яё]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeIsbn(value?: string): string | undefined {
  const normalized = value?.replace(/[-\s]/g, '').toUpperCase()
  if (!normalized || (normalized.length !== 10 && normalized.length !== 13)) return undefined
  if (!/^(?:97[89])?[0-9]{9}[0-9X]$/.test(normalized)) return undefined
  return normalized
}

function normalizeId(value?: number | string | null): number | undefined {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

function normalizeNumber(value?: number | string): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function emptyResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'X-Metso-FantLab-Status': 'not-found',
    },
  })
}
