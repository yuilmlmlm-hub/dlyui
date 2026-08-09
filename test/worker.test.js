import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handleRequest } from '../src/index.js';

class MemoryKV {
  constructor(map) {
    this.map = map;
  }

  async get(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  async put(key, value, opts) {
    this.map.set(key, String(value));
  }

  async delete(key) {
    this.map.delete(key);
  }

  async list({ prefix = '', cursor } = {}) {
    const keys = [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + 1000);
    const next = start + page.length;
    return {
      keys: page.map((name) => ({ name })),
      cursor: next < keys.length ? String(next) : undefined,
    };
  }
}

function makeEnv(opts = {}) {
  return {
    LINKS: new MemoryKV(new Map()),
    ADMIN_PASSWORD: opts.adminPassword === undefined ? 'admin123' : opts.adminPassword,
    APP_SECRET: opts.appSecret === undefined ? 'test-app-secret' : opts.appSecret,
  };
}

const ctx = { waitUntil() {} };
const base = 'http://short.test';

function req(path, init = {}) {
  return new Request(base + path, init);
}

async function login(env, password = 'admin123') {
  const r = await handleRequest(
    req('/admin/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
    env,
    ctx,
  );
  assert.equal(r.status, 200, await r.text());
  const cookie = r.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0];
}

function authHeaders(cookie, extra = {}) {
  return { cookie, 'content-type': 'application/json', ...extra };
}

async function createLink(env, cookie, body) {
  const r = await handleRequest(
    req('/admin/api/links', { method: 'POST', headers: authHeaders(cookie), body: JSON.stringify(body) }),
    env,
    ctx,
  );
  assert.equal(r.status, 201, r.status === 201 ? '' : await r.text());
  return (await r.json()).data;
}

async function postPassword(env, code, password) {
  return handleRequest(
    req(`/${code}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(password)}`,
    }),
    env,
    ctx,
  );
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

test('full flow: admin login, create, password gate, redirect mode, edit, delete', async () => {
  const env = makeEnv();
  const cookie = await login(env);

  const created = await createLink(env, cookie, {
    code: 'abc',
    target: 'https://example.com/secret-page',
    password: 'pw123',
    mode: 'redirect',
    expiresAt: null,
  });
  assert.equal(created.code, 'abc');
  assert.equal(created.hasPassword, true);
  assert.equal(created.passwordHash, undefined);

  const g1 = await handleRequest(req('/abc'), env, ctx);
  assert.equal(g1.status, 401);
  const body1 = await g1.text();
  assert.ok(body1.includes('该链接已加密'));
  assert.ok(!body1.includes('example.com'), 'password page must not reveal target');

  const wrong = await postPassword(env, 'abc', 'wrong');
  assert.equal(wrong.status, 401);
  assert.ok((await wrong.text()).includes('密码错误'));

  const right = await postPassword(env, 'abc', 'pw123');
  assert.equal(right.status, 303);
  assert.ok(right.headers.get('set-cookie').startsWith('sl_auth_abc='));
  const linkCookie = right.headers.get('set-cookie').split(';')[0];

  const g2 = await handleRequest(req('/abc', { headers: { cookie: linkCookie } }), env, ctx);
  assert.equal(g2.status, 302);
  assert.equal(g2.headers.get('location'), 'https://example.com/secret-page');
  assert.equal(g2.headers.get('referrer-policy'), 'no-referrer');

  const list = await handleRequest(req('/admin/api/links', { headers: { cookie } }), env, ctx);
  const data = await list.json();
  assert.equal(data.data[0].visits, 1);

  const edit = await handleRequest(
    req('/admin/api/links/abc', {
      method: 'PUT',
      headers: authHeaders(cookie),
      body: JSON.stringify({ target: 'https://example.com/new-page', expiresAt: null }),
    }),
    env,
    ctx,
  );
  assert.equal(edit.status, 200);
  const g3 = await handleRequest(req('/abc', { headers: { cookie: linkCookie } }), env, ctx);
  assert.equal(g3.headers.get('location'), 'https://example.com/new-page');

  const del = await handleRequest(req('/admin/api/links/abc', { method: 'DELETE', headers: authHeaders(cookie) }), env, ctx);
  assert.equal(del.status, 200);
  const g4 = await handleRequest(req('/abc'), env, ctx);
  assert.equal(g4.status, 404);
});

test('expired and disabled links are blocked', async () => {
  const env = makeEnv();
  const cookie = await login(env);
  await createLink(env, cookie, {
    code: 'exp',
    target: 'https://example.com/x',
    expiresAt: new Date(Date.now() - 60000).toISOString(),
  });
  await createLink(env, cookie, {
    code: 'off',
    target: 'https://example.com/y',
    enabled: false,
  });
  const r1 = await handleRequest(req('/exp'), env, ctx);
  assert.equal(r1.status, 410);
  assert.ok((await r1.text()).includes('已过期'));
  const r2 = await handleRequest(req('/off'), env, ctx);
  assert.equal(r2.status, 404);
});

test('rate limiting blocks brute force after 5 failures', async () => {
  const env = makeEnv();
  const cookie = await login(env);
  await createLink(env, cookie, { code: 'rl', target: 'https://example.com/x', password: 'pw123' });
  for (let i = 0; i < 5; i++) {
    const r = await postPassword(env, 'rl', 'bad');
    assert.equal(r.status, 401);
  }
  const blocked = await postPassword(env, 'rl', 'pw123');
  assert.equal(blocked.status, 429);
  assert.ok((await blocked.text()).includes('尝试次数过多'));
});

test('proxy mode keeps target hidden and proxies subresources', async () => {
  const { server, url } = await startServer((req2, res) => {
    if (req2.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><head></head><body><a href="/other">x</a><p>hello proxy</p></body></html>');
    } else {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('sub resource');
    }
  });

  try {
    const env = makeEnv();
    const cookie = await login(env);
    await createLink(env, cookie, { code: 'px', target: url + '/page', password: 'pw123', mode: 'proxy' });

    const unauth = await handleRequest(req(`/px?to=${encodeURIComponent(url + '/other')}`), env, ctx);
    assert.equal(unauth.status, 401);

    const right = await postPassword(env, 'px', 'pw123');
    const linkCookie = right.headers.get('set-cookie').split(';')[0];

    const sub = await handleRequest(req(`/px?to=${encodeURIComponent(url + '/other')}`, { headers: { cookie: linkCookie } }), env, ctx);
    assert.equal(sub.status, 200);
    assert.equal(await sub.text(), 'sub resource');

    const main = await handleRequest(req('/px', { headers: { cookie: linkCookie } }), env, ctx);
    assert.equal(main.status, 200);
    assert.equal(main.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.ok((await main.text()).includes('hello proxy'));

    const evil = await handleRequest(
      req(`/px?to=${encodeURIComponent('https://evil.example/steal')}`, { headers: { cookie: linkCookie } }),
      env,
      ctx,
    );
    assert.equal(evil.status, 403);
  } finally {
    server.close();
  }
});

test('export and import roundtrip', async () => {
  const env = makeEnv();
  const cookie = await login(env);
  await createLink(env, cookie, { code: 'a1', target: 'https://example.com/1' });
  await createLink(env, cookie, { code: 'a2', target: 'https://example.com/2', password: 'p2' });

  const exp = await handleRequest(req('/admin/api/export', { headers: { cookie } }), env, ctx);
  const exported = (await exp.json()).data;
  assert.equal(exported.length, 2);

  const newEnv = makeEnv();
  const newCookie = await login(newEnv);
  const imp = await handleRequest(
    req('/admin/api/import', {
      method: 'POST',
      headers: authHeaders(newCookie),
      body: JSON.stringify({ links: exported }),
    }),
    newEnv,
    ctx,
  );
  const res = await imp.json();
  assert.equal(res.data.created, 2);
  assert.equal(res.data.updated, 0);

  const list = await handleRequest(req('/admin/api/links', { headers: { cookie: newCookie } }), newEnv, ctx);
  const links = (await list.json()).data;
  assert.equal(links.length, 2);
  assert.equal(links.find((l) => l.code === 'a2').hasPassword, true);
});

test('change password invalidates old session and requires new password', async () => {
  const env = makeEnv({ appSecret: '' });
  const cookie = await login(env);
  const r = await handleRequest(
    req('/admin/api/password', {
      method: 'POST',
      headers: authHeaders(cookie),
      body: JSON.stringify({ oldPassword: 'admin123', newPassword: 'newpass456' }),
    }),
    env,
    ctx,
  );
  assert.equal(r.status, 200);

  const oldSession = await handleRequest(req('/admin/api/session', { headers: { cookie } }), env, ctx);
  assert.equal(oldSession.status, 401);

  const newCookie = await login(env, 'newpass456');
  const session = await handleRequest(req('/admin/api/session', { headers: { cookie: newCookie } }), env, ctx);
  assert.equal(session.status, 200);
});

test('admin login fails when no password configured', async () => {
  const env = makeEnv({ adminPassword: '' });
  const r = await handleRequest(
    req('/admin/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'x' }),
    }),
    env,
    ctx,
  );
  assert.equal(r.status, 503);
});
