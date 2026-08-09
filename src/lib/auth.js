import { bytesToHex, hexToBytes, bytesEqual } from './helpers.js';

const enc = new TextEncoder();
const DEFAULT_ITERATIONS = 100000;

export async function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2:${iterations}:${bytesToHex(salt)}:${bytesToHex(bits)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = hexToBytes(parts[2]);
  const expected = hexToBytes(parts[3]);
  if (!Number.isFinite(iterations) || iterations < 1 || expected.length === 0) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    expected.length * 8,
  );
  return bytesEqual(new Uint8Array(bits), expected);
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return bytesToHex(sig);
}

export async function makeToken(secret, payload, expiresAtMs) {
  const sig = await hmacHex(secret, `${payload}|${expiresAtMs}`);
  return `${expiresAtMs}.${sig}`;
}

export async function verifyToken(secret, payload, token) {
  if (!token) return false;
  const idx = token.indexOf('.');
  if (idx < 0) return false;
  const expiresAtMs = Number(token.slice(0, idx));
  const sig = token.slice(idx + 1);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;
  const expected = await hmacHex(secret, `${payload}|${expiresAtMs}`);
  return bytesEqual(enc.encode(sig), enc.encode(expected));
}
