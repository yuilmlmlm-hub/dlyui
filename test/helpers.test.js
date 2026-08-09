import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCode,
  normalizeUrl,
  parseExpiry,
  randomCode,
  bytesToHex,
  hexToBytes,
} from '../src/lib/helpers.js';
import { rewriteUrl, rewriteSrcset } from '../src/lib/proxy.js';

test('randomCode generates valid codes', () => {
  for (let i = 0; i < 50; i++) {
    const code = randomCode();
    assert.equal(code.length, 7);
    assert.ok(isValidCode(code));
  }
});

test('isValidCode rejects bad codes', () => {
  assert.equal(isValidCode('abc123'), true);
  assert.equal(isValidCode('a_b-c'), true);
  assert.equal(isValidCode(''), false);
  assert.equal(isValidCode('a b'), false);
  assert.equal(isValidCode('中文'), false);
  assert.equal(isValidCode('a'.repeat(65)), false);
});

test('normalizeUrl validates http(s) urls', () => {
  assert.equal(normalizeUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(normalizeUrl(' http://a.b '), 'http://a.b/');
  assert.equal(normalizeUrl('ftp://a.b'), null);
  assert.equal(normalizeUrl('not a url'), null);
  assert.equal(normalizeUrl(''), null);
});

test('parseExpiry converts to ISO or null', () => {
  assert.ok(parseExpiry('2030-01-01T00:00:00Z').endsWith('Z'));
  assert.equal(parseExpiry(''), null);
  assert.equal(parseExpiry(null), null);
  assert.equal(parseExpiry('garbage'), null);
});

test('hex roundtrip', () => {
  const bytes = new Uint8Array([0, 1, 15, 255]);
  const hex = bytesToHex(bytes);
  assert.equal(hex, '00010fff');
  assert.deepEqual(Array.from(hexToBytes(hex)), [0, 1, 15, 255]);
});

test('rewriteUrl rewrites same-origin urls only', () => {
  const base = new URL('https://target.example/dir/page');
  assert.equal(rewriteUrl('/x.css', base, 'abc'), '/abc?to=' + encodeURIComponent('https://target.example/x.css'));
  assert.equal(
    rewriteUrl('https://target.example/y.js', base, 'abc'),
    '/abc?to=' + encodeURIComponent('https://target.example/y.js'),
  );
  assert.equal(rewriteUrl('https://other.example/z.js', base, 'abc'), 'https://other.example/z.js');
  assert.equal(rewriteUrl('#frag', base, 'abc'), '#frag');
  assert.equal(rewriteUrl('javascript:void(0)', base, 'abc'), 'javascript:void(0)');
  assert.equal(rewriteUrl('', base, 'abc'), '');
});

test('rewriteSrcset rewrites candidates', () => {
  const base = new URL('https://target.example/');
  const out = rewriteSrcset('/a.png 1x, /b.png 2x', base, 'abc');
  assert.ok(out.includes('/abc?to='));
  assert.ok(out.includes('1x'));
  assert.ok(out.includes('2x'));
});
