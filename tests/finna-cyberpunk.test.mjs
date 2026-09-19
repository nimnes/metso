import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { searchFinna } from '../src/api/finna.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function cyberpunkFilters(query = '') {
  return {
    query,
    languageCodes: [],
    genreValues: ['cyberpunk'],
    branchCodes: [],
    sort: 'relevance',
  }
}

test('Cyberpunk uses one cross-field OR search clause', async () => {
  let requestUrl
  globalThis.fetch = async (request) => {
    requestUrl = new URL(request)
    return Response.json({ status: 'OK', resultCount: 58, records: [] })
  }

  const result = await searchFinna(cyberpunkFilters())

  assert.equal(result.total, 58)
  assert.equal(requestUrl.searchParams.get('lookfor'), '(genre_facet:"Kyberpunk" OR topic_facet:"kyberpunk")')
  assert.equal(requestUrl.searchParams.getAll('filter[]').some((filter) => /Kyberpunk|kyberpunk/.test(filter)), false)
})

test('Cyberpunk combines a typed search with its OR clause', async () => {
  let requestUrl
  globalThis.fetch = async (request) => {
    requestUrl = new URL(request)
    return Response.json({ status: 'OK', resultCount: 17, records: [] })
  }

  await searchFinna(cyberpunkFilters('Akira'))

  assert.equal(requestUrl.searchParams.get('lookfor'), '(Akira) AND (genre_facet:"Kyberpunk" OR topic_facet:"kyberpunk")')
})
