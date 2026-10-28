import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUrlString } from '../src/Utils/Helpers.js';
import { getIntParam } from '../src/Utils/Params.js';

test('query parameters preserve namespaces and merge without duplicate question marks', () => {
  assert.equal(getUrlString('doorphone://client/doorphone'), 'doorphone://client/doorphone');
  assert.equal(getUrlString('https://example.com/a?high=1', { high: false, id: 12 }), 'https://example.com/a?high=false&id=12');
  assert.equal(getUrlString('https://example.com/a', { filter: { name: 'a b' } }), 'https://example.com/a?filter%5Bname%5D=a%20b');
});

test('device identifiers reject invalid values while permitting omitted defaults', () => {
  assert.equal(getIntParam(new URLSearchParams(), 'id'), null);
  assert.equal(getIntParam(new URLSearchParams('id=12'), 'id'), 12);
  for (const id of ['NaN', '-1', '0', '1.5', '12abc']) assert.throws(() => getIntParam(new URLSearchParams({ id }), 'id'));
});
