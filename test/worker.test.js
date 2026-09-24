import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const env = { ASSETS: { fetch: req => new Response('asset:' + new URL(req.url).pathname) } };

test('the old subdomain redirects to the new one, keeping path and query', async () => {
  const res = await worker.fetch(new Request('https://values.fardus.dev/some/path?x=1'), env);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://palettekit.fardus.dev/some/path?x=1');
});

test('the new subdomain serves the static assets', async () => {
  const res = await worker.fetch(new Request('https://palettekit.fardus.dev/js/app.js'), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'asset:/js/app.js');
});
