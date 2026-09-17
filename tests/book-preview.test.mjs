import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { renderBookShareResponse } from '../functions/book/[id].ts'
import { getBookCoverResponse } from '../functions/api/book-cover.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const context = {
  request: new Request('https://metso.example/share/piki.3114615?v=share5'),
  params: { id: 'piki.3114615' },
}

test('book preview exposes title, cover and both destinations without JavaScript', async () => {
  globalThis.fetch = async () => Response.json({ status: 'OK', records: [{
    id: 'piki.3114615', title: 'Couture sewing techniques', year: '2011',
  }] })
  const response = await renderBookShareResponse(context)
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.match(html, /og:title" content="Couture sewing techniques"/)
  assert.match(html, /og:image" content="https:\/\/metso.example\/preview-image\/piki.3114615.jpg\?v=share5"/)
  assert.match(html, /href="https:\/\/metso.example\/\?book=piki.3114615"/)
  assert.match(html, /href="https:\/\/piki.finna.fi\/Record\/piki.3114615"/)
})

test('upstream failures cannot produce successful generic previews or icon redirects', async () => {
  globalThis.fetch = async () => { throw new Error('Temporary outage') }
  for (const response of [
    await renderBookShareResponse(context),
    await getBookCoverResponse('piki.3114615', true),
    await getBookCoverResponse('piki.3114615', false),
  ]) {
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    assert.equal(response.headers.get('Location'), null)
  }
})

test('capitalized Russian fallback titles render without throwing', async () => {
  globalThis.fetch = async () => Response.json({ status: 'OK', records: [{
    id: 'piki.123', title: 'Den', languages: ['rus'],
  }] })
  const response = await renderBookShareResponse(context)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /og:title" content="День"/)
})

test('cover endpoint returns image bytes and supports HEAD', async () => {
  globalThis.fetch = async (url) => String(url).includes('/record?')
    ? Response.json({ status: 'OK', records: [{ id: 'piki.3114615', images: ['/cover.jpg'] }] })
    : new Response(new Uint8Array([255, 216, 255]), { headers: { 'Content-Type': 'image/jpeg' } })
  const response = await getBookCoverResponse('piki.3114615', true)
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg')
  assert.equal((await response.arrayBuffer()).byteLength, 3)
  const head = await getBookCoverResponse('piki.3114615', false)
  assert.equal(head.headers.get('Content-Length'), '3')
  assert.equal(await head.text(), '')
})
