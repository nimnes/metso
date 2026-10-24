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

for (const query of ['', 'Akira']) {
  test(`Cyberpunk and Science Fiction form one OR group${query ? ' within a typed search' : ''}`, async () => {
    let requestUrl
    globalThis.fetch = async (request) => {
      requestUrl = new URL(request)
      return Response.json({ status: 'OK', resultCount: 100, records: [] })
    }
    await searchFinna({ ...cyberpunkFilters(query), genreValues: ['cyberpunk', 'science-fiction'] })
    const genres = '((genre_facet:"Kyberpunk" OR topic_facet:"kyberpunk") OR (genre_facet:"Tieteiskirjallisuus" OR genre_facet:"Science fiction"))'
    assert.equal(requestUrl.searchParams.get('lookfor'), query ? `(Akira) AND ${genres}` : genres)
    assert.equal(requestUrl.searchParams.getAll('filter[]').some((filter) => filter.startsWith('~genre_facet:') || filter.startsWith('~topic_facet:')), false)
  })
}

test('genres using different facet fields are also alternatives', async () => {
  let requestUrl
  globalThis.fetch = async (request) => {
    requestUrl = new URL(request)
    return Response.json({ status: 'OK', resultCount: 100, records: [] })
  }
  await searchFinna({ ...cyberpunkFilters(), genreValues: ['science-fiction', 'art', 'nonfiction'], languageCodes: ['eng'], branchCodes: ['holdings:1 001 piki'] })
  assert.equal(requestUrl.searchParams.get('lookfor'), '((genre_facet:"Tieteiskirjallisuus" OR genre_facet:"Science fiction") OR (topic_facet:"taide" OR topic_facet:"taiteilijat" OR topic_facet:"kuvataide") OR (major_genre_str_mv:"nonfiction"))')
  const filters = requestUrl.searchParams.getAll('filter[]')
  assert.ok(filters.includes('~language:"eng"'))
  assert.ok(filters.includes('~holdings_txtP_mv:"1 001 piki"'))
  assert.equal(filters.some((filter) => /^~(?:genre_facet|topic_facet|major_genre_str_mv):/.test(filter)), false)
})

test('no genres leaves the typed or unrestricted query unchanged', async () => {
  const queries = []
  globalThis.fetch = async (request) => {
    queries.push(new URL(request).searchParams.get('lookfor'))
    return Response.json({ status: 'OK', resultCount: 0, records: [] })
  }
  await searchFinna({ ...cyberpunkFilters(), genreValues: [] })
  await searchFinna({ ...cyberpunkFilters('Akira'), genreValues: [] })
  assert.deepEqual(queries, ['*', 'Akira'])
})
