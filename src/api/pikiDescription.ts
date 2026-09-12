import { removeDuplicateRussianTransliteration } from './descriptionCleanup'

type PikiDescriptionResponse = {
  description?: string
}

const CACHE_PREFIX = 'metso-piki-description-v4:'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 14

export async function getPikiDescription(isbn?: string): Promise<string | undefined> {
  const normalizedIsbn = normalizeIsbn(isbn)
  if (!normalizedIsbn) return undefined

  const cacheKey = `${CACHE_PREFIX}${normalizedIsbn}`
  const cached = readCache(cacheKey)
  if (cached !== undefined) return cached || undefined

  const params = new URLSearchParams({ isbn: normalizedIsbn })
  const response = await fetch(`/api/piki-description?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  })
  if (response.status === 204 || !response.ok) {
    writeCache(cacheKey, '')
    return undefined
  }

  if (!response.headers.get('content-type')?.includes('application/json')) return undefined

  const data = (await response.json()) as PikiDescriptionResponse
  const description = cleanDescription(data.description)
  writeCache(cacheKey, description ?? '')
  return description
}

function normalizeIsbn(value?: string): string | undefined {
  const normalized = value?.replace(/[-\s]/g, '').toUpperCase()
  return normalized && (normalized.length === 10 || normalized.length === 13) ? normalized : undefined
}

function cleanText(value?: string): string | undefined {
  const cleaned = (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned || undefined
}

function cleanDescription(value?: string): string | undefined {
  const cleaned = cleanText(value)
  return cleaned ? removeDuplicateRussianTransliteration(cleaned) : undefined
}

function readCache(key: string): string | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { expires: number; value: string }
    if (parsed.expires < Date.now()) {
      localStorage.removeItem(key)
      return undefined
    }
    return parsed.value
  } catch {
    return undefined
  }
}

function writeCache(key: string, value: string): void {
  try {
    localStorage.setItem(key, JSON.stringify({ expires: Date.now() + CACHE_TTL, value }))
  } catch {
    // Best-effort cache only.
  }
}
