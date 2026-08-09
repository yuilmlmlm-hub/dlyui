import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, makeToken, verifyToken } from '../src/lib/auth.js';

test('password hash and verify roundtrip', async () => {
  const hash = await hashPassword('secret123');
  assert.equal(await verifyPassword('secret123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword('secret123', null), false);
  assert.equal(await verifyPassword('secret123', 'garbage'), false);
});

test('hash contains salt and iterations', async () => {
  const hash = await hashPassword('x', 1000);
  const parts = hash.split(':');
  assert.equal(parts[0], 'pbkdf2');
  assert.equal(parts[1], '1000');
  assert.equal(parts[2].length, 32);
  assert.equal(parts[3].length, 64);
});

test('tokens verify with correct payload and expire', async () => {
  const future = Date.now() + 60000;
  const token = await makeToken('secret', 'link|abc', future);
  assert.equal(await verifyToken('secret', 'link|abc', token), true);
  assert.equal(await verifyToken('secret', 'link|xyz', token), false);
  assert.equal(await verifyToken('other', 'link|abc', token), false);

  const past = Date.now() - 1000;
  const old = await makeToken('secret', 'link|abc', past);
  assert.equal(await verifyToken('secret', 'link|abc', old), false);
  assert.equal(await verifyToken('secret', 'link|abc', null), false);
  assert.equal(await verifyToken('secret', 'link|abc', 'malformed'), false);
});
