import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { searchFinna } from '../src/api/finna.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const expeditionClause = '(major_genre_str_mv:"nonfiction" AND (topic_facet:"tutkimusmatkat" OR topic_facet:"naparetket"))'

for (const query of ['', 'Shackleton']) {
  for (const withManga of [false, true]) {
    test(`expeditions require nonfiction${withManga ? ' without restricting another selected genre' : ''}${query ? ' within a typed search' : ''}`, async () => {
      let requestUrl
      globalThis.fetch = async (request) => {
        requestUrl = new URL(request)
        return Response.json({ status: 'OK', resultCount: 0, records: [] })
      }
      await searchFinna({
        query,
        languageCodes: [],
        genreValues: withManga ? ['expeditions-exploration', 'manga'] : ['expeditions-exploration'],
        branchCodes: [],
        sort: 'relevance',
      })
      const genreQuery = withManga ? `(${expeditionClause} OR (topic_facet:"manga"))` : expeditionClause
      assert.equal(requestUrl.searchParams.get('lookfor'), query ? `(${query}) AND ${genreQuery}` : genreQuery)
      // Nonfiction belongs inside the expedition alternative, not a global filter.
      assert.equal(requestUrl.searchParams.getAll('filter[]').some((filter) => filter.includes('major_genre_str_mv')), false)
    })
  }
}
