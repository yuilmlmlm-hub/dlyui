import {
  randomCode,
  isValidCode,
  normalizeUrl,
  parseExpiry,
  nowIso,
  json,
  ok,
  fail,
  text,
  clientIp,
} from './lib/helpers.js';
import { hashPassword, verifyPassword, makeToken, verifyToken } from './lib/auth.js';
import { proxyRequest } from './lib/proxy.js';
import { landingPage, passwordPage, expiredPage, notFoundPage, adminPage } from './lib/templates.js';

const LINK_COOKIE_PREFIX = 'sl_auth_';
const ADMIN_COOKIE = 'sl_admin';
const LINK_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const RATE_TTL_SECONDS = 600;
const DEFAULT_ITERATIONS = 100000;

const keyOf = (code) => `link:${code}`;

function pbkdf2Iterations(env) {
  const n = Number(env.PBKDF2_ITERATIONS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_ITERATIONS;
}

async function getRecord(env, code) {
  const raw = await env.LINKS.get(keyOf(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function putRecord(env, record) {
  await env.LINKS.put(keyOf(record.code), JSON.stringify(record));
}

async function getSecret(env) {
  if (env.APP_SECRET) return String(env.APP_SECRET);
  const existing = await env.LINKS.get('cfg:secret');
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.LINKS.put('cfg:secret', secret);
  return secret;
}

async function rotateSecret(env) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.LINKS.put('cfg:secret', secret);
  return secret;
}

async function getAdminHash(env) {
  const existing = await env.LINKS.get('cfg:admin');
  if (existing) return existing;
  if (env.ADMIN_PASSWORD) {
    const hash = await hashPassword(String(env.ADMIN_PASSWORD), pbkdf2Iterations(env));
    const record = JSON.stringify({ hash, createdAt: nowIso() });
    await env.LINKS.put('cfg:admin', record);
    return record;
  }
  return null;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function cookieHeader(name, value, secure, maxAgeSeconds) {
  let c = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax`;
  if (secure) c += '; Secure';
  if (maxAgeSeconds) c += `; Max-Age=${maxAgeSeconds}`;
  return c;
}

function clearCookieHeader(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function requireAdmin(request, env) {
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return false;
  const secret = await getSecret(env);
  return verifyToken(secret, 'admin', token);
}

async function checkRate(env, key) {
  const raw = await env.LINKS.get(key);
  return Number(raw || 0) >= MAX_FAILURES;
}

async function bumpRate(env, key) {
  const raw = await env.LINKS.get(key);
  const n = Number(raw || 0) + 1;
  await env.LINKS.put(key, String(n), { expirationTtl: RATE_TTL_SECONDS });
}

async function clearRate(env, key) {
  await env.LINKS.delete(key);
}

async function listAllLinks(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.LINKS.list({ prefix: 'link:', limit: 1000, cursor });
    for (const k of page.keys) {
      const raw = await env.LINKS.get(k.name);
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw));
      } catch {}
    }
    cursor = page.cursor;
  } while (cursor);
  return out;
}

function publicRecord(record) {
  const clone = { ...record };
  delete clone.passwordHash;
  clone.hasPassword = !!record.passwordHash;
  return clone;
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

async function handleAdminApi(request, env, url, path) {
  if (path === '/admin/api/login') {
    if (request.method !== 'POST') return fail('方法不允许', 405);
    const adminRaw = await getAdminHash(env);
    if (!adminRaw) {
      return fail('尚未配置管理员密码：请在 Cloudflare 控制台为 Worker 添加 ADMIN_PASSWORD 环境变量（Secret）后重试。', 503);
    }
    const ip = clientIp(request);
    const rateKey = `rl:admin:${ip}`;
    if (await checkRate(env, rateKey)) return fail('尝试次数过多，请10分钟后再试。', 429);
    const body = await readJson(request);
    const password = typeof body.password === 'string' ? body.password : '';
    const admin = JSON.parse(adminRaw);
    if (await verifyPassword(password, admin.hash)) {
      await clearRate(env, rateKey);
      const secret = await getSecret(env);
      const token = await makeToken(secret, 'admin', Date.now() + ADMIN_TTL_MS);
      const resp = ok({ expiresAt: new Date(Date.now() + ADMIN_TTL_MS).toISOString() });
      resp.headers.set('set-cookie', cookieHeader(ADMIN_COOKIE, token, url.protocol === 'https:', ADMIN_TTL_MS / 1000));
      return resp;
    }
    await bumpRate(env, rateKey);
    return fail('管理员密码错误', 401);
  }

  const authed = await requireAdmin(request, env);
  if (!authed) {
    if (path === '/admin/api/session') {
      const adminRaw = await getAdminHash(env);
      if (!adminRaw) return fail('尚未配置管理员密码', 503);
      return fail('未登录', 401);
    }
    return fail('未登录', 401);
  }

  if (path === '/admin/api/session') return ok({});

  if (path === '/admin/api/logout') {
    const resp = ok({});
    resp.headers.set('set-cookie', clearCookieHeader(ADMIN_COOKIE));
    return resp;
  }

  if (path === '/admin/api/links') {
    if (request.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const all = await listAllLinks(env);
      all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const filtered = q
        ? all.filter(
            (r) =>
              (r.code || '').toLowerCase().includes(q) ||
              (r.target || '').toLowerCase().includes(q) ||
              (r.note || '').toLowerCase().includes(q),
          )
        : all;
      return ok(filtered.map(publicRecord));
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      let code = typeof body.code === 'string' && body.code.trim() ? body.code.trim() : randomCode();
      if (!isValidCode(code)) return fail('短码只能包含字母、数字、下划线或短横线，长度1-64。', 400);
      const target = normalizeUrl(body.target);
      if (!target) return fail('目标网址无效，请输入以 http:// 或 https:// 开头的完整网址。', 400);
      if (await env.LINKS.get(keyOf(code))) return fail(`短码已被占用：${code}`, 409);
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length > 128) return fail('密码长度不能超过128个字符。', 400);
      const expiresAt = parseExpiry(body.expiresAt);
      if (body.expiresAt && !expiresAt) return fail('过期时间格式无效。', 400);
      const now = nowIso();
      const record = {
        code,
        target,
        mode: body.mode === 'proxy' ? 'proxy' : 'redirect',
        passwordHash: password ? await hashPassword(password, pbkdf2Iterations(env)) : null,
        expiresAt,
        enabled: body.enabled !== false,
        note: String(body.note || '').slice(0, 500),
        createdAt: now,
        updatedAt: now,
        visits: 0,
        lastVisitAt: null,
      };
      await putRecord(env, record);
      return ok(publicRecord(record), 201);
    }
    return fail('方法不允许', 405);
  }

  if (path === '/admin/api/export') {
    const all = await listAllLinks(env);
    return ok(all);
  }

  if (path === '/admin/api/import') {
    if (request.method !== 'POST') return fail('方法不允许', 405);
    const body = await readJson(request);
    const links = Array.isArray(body.links) ? body.links : [];
    if (!links.length) return fail('没有可导入的记录。', 400);
    let created = 0;
    let updated = 0;
    const now = nowIso();
    for (const item of links) {
      const code = typeof item.code === 'string' && isValidCode(item.code) ? item.code : null;
      const target = normalizeUrl(item.target);
      if (!code || !target) continue;
      let existing = null;
      try {
        existing = JSON.parse(await env.LINKS.get(keyOf(code)) || 'null');
      } catch {}
      const record = {
        code,
        target,
        mode: item.mode === 'proxy' ? 'proxy' : 'redirect',
        passwordHash:
          typeof item.passwordHash === 'string' && item.passwordHash.startsWith('pbkdf2:') ? item.passwordHash : null,
        expiresAt: parseExpiry(item.expiresAt),
        enabled: item.enabled !== false,
        note: String(item.note || '').slice(0, 500),
        createdAt: existing && existing.createdAt ? existing.createdAt : now,
        updatedAt: now,
        visits: Number(item.visits) > 0 ? Math.floor(Number(item.visits)) : 0,
        lastVisitAt: item.lastVisitAt || null,
      };
      await env.LINKS.put(keyOf(code), JSON.stringify(record));
      if (existing) updated += 1;
      else created += 1;
    }
    return ok({ created, updated });
  }

  if (path === '/admin/api/password') {
    if (request.method !== 'POST') return fail('方法不允许', 405);
    const body = await readJson(request);
    const adminRaw = await getAdminHash(env);
    const admin = adminRaw ? JSON.parse(adminRaw) : null;
    if (!admin) return fail('尚未配置管理员密码。', 503);
    const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!(await verifyPassword(oldPassword, admin.hash))) return fail('原密码错误。', 401);
    if (newPassword.length < 6) return fail('新密码至少6个字符。', 400);
    if (newPassword.length > 128) return fail('新密码过长。', 400);
    const hash = await hashPassword(newPassword, pbkdf2Iterations(env));
    await env.LINKS.put('cfg:admin', JSON.stringify({ hash, createdAt: admin.createdAt, updatedAt: nowIso() }));
    await rotateSecret(env);
    const resp = ok({});
    resp.headers.set('set-cookie', clearCookieHeader(ADMIN_COOKIE));
    return resp;
  }

  const m = path.match(/^\/admin\/api\/links\/([A-Za-z0-9_-]+)$/);
  if (m) {
    const code = m[1];
    const existing = await getRecord(env, code);
    if (!existing) return fail('链接不存在', 404);
    if (request.method === 'PUT') {
      const body = await readJson(request);
      const record = { ...existing };
      const nextCode = typeof body.code === 'string' && body.code.trim() ? body.code.trim() : code;
      if (nextCode !== code) {
        if (!isValidCode(nextCode)) return fail('短码格式无效。', 400);
        if (await env.LINKS.get(keyOf(nextCode))) return fail(`短码已被占用：${nextCode}`, 409);
        await env.LINKS.delete(keyOf(code));
        record.code = nextCode;
      }
      if (body.target !== undefined) {
        const target = normalizeUrl(body.target);
        if (!target) return fail('目标网址无效。', 400);
        record.target = target;
      }
      if (body.mode !== undefined) record.mode = body.mode === 'proxy' ? 'proxy' : 'redirect';
      if (body.enabled !== undefined) record.enabled = !!body.enabled;
      if (body.note !== undefined) record.note = String(body.note || '').slice(0, 500);
      if (body.expiresAt !== undefined) {
        const expiresAt = parseExpiry(body.expiresAt);
        if (body.expiresAt && !expiresAt) return fail('过期时间格式无效。', 400);
        record.expiresAt = expiresAt;
      }
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (newPassword) {
        if (newPassword.length > 128) return fail('密码过长。', 400);
        record.passwordHash = await hashPassword(newPassword, pbkdf2Iterations(env));
      } else if (body.clearPassword) {
        record.passwordHash = null;
      }
      record.updatedAt = nowIso();
      await putRecord(env, record);
      return ok(publicRecord(record));
    }
    if (request.method === 'DELETE') {
      await env.LINKS.delete(keyOf(code));
      return ok({ deleted: code });
    }
    return fail('方法不允许', 405);
  }

  return fail('接口不存在', 404);
}

async function bumpVisit(env, record) {
  record.visits = (Number(record.visits) || 0) + 1;
  record.lastVisitAt = nowIso();
  await putRecord(env, record);
}

async function handleLink(request, env, url, code) {
  const record = await getRecord(env, code);
  if (!record) return text(notFoundPage(), 404);
  if (!record.enabled) return text(notFoundPage(), 404);
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
    return text(expiredPage(code), 410, { 'cache-control': 'no-store' });
  }

  const hasPassword = !!record.passwordHash;
  const secret = await getSecret(env);
  const authed =
    !hasPassword || (await verifyToken(secret, `${code}|link`, readCookie(request, LINK_COOKIE_PREFIX + code)));
  const toParam = url.searchParams.get('to');
  const isSubRequest = toParam !== null;

  if (request.method === 'GET' || request.method === 'HEAD') {
    if (isSubRequest && record.mode !== 'proxy') return fail('该短链不是代理模式', 403);
    if (!authed) return text(passwordPage(code, null, request.url), 401, { 'cache-control': 'no-store' });
    if (isSubRequest) return proxyRequest(request, record, code);
    if (record.mode === 'proxy') {
      await bumpVisit(env, record);
      return proxyRequest(request, record, code);
    }
    const resp = new Response(null, {
      status: 302,
      headers: { location: record.target, 'referrer-policy': 'no-referrer' },
    });
    await bumpVisit(env, record);
    return resp;
  }

  if (request.method === 'POST') {
    if (isSubRequest) {
      if (record.mode !== 'proxy') return fail('该短链不是代理模式', 403);
      if (!authed) return text(passwordPage(code, null, request.url), 401, { 'cache-control': 'no-store' });
      return proxyRequest(request, record, code);
    }
    const ip = clientIp(request);
    const rateKey = `rl:${code}:${ip}`;
    if (await checkRate(env, rateKey)) {
      return text(passwordPage(code, '尝试次数过多，请10分钟后再试。', request.url), 429, { 'cache-control': 'no-store' });
    }
    const form = await request.formData().catch(() => null);
    const password = form ? String(form.get('password') || '') : '';
    if (await verifyPassword(password, record.passwordHash)) {
      await clearRate(env, rateKey);
      const token = await makeToken(secret, `${code}|link`, Date.now() + LINK_TTL_MS);
      const resp = new Response(null, { status: 303, headers: { location: request.url } });
      resp.headers.set(
        'set-cookie',
        cookieHeader(LINK_COOKIE_PREFIX + code, token, url.protocol === 'https:', LINK_TTL_MS / 1000),
      );
      return resp;
    }
    await bumpRate(env, rateKey);
    return text(passwordPage(code, '密码错误，请重试。', request.url), 401, { 'cache-control': 'no-store' });
  }

  return text(notFoundPage(), 404);
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/') return text(landingPage());
  if (path === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  if (path === '/favicon.ico') return new Response(null, { status: 204 });
  if (path === '/admin' || path === '/admin/') {
    return text(adminPage(), 200, { 'cache-control': 'no-store' });
  }
  if (path.startsWith('/admin/api/')) return handleAdminApi(request, env, url, path);
  const m = path.match(/^\/([A-Za-z0-9_-]{1,64})\/?$/);
  if (m) return handleLink(request, env, url, m[1]);
  return text(notFoundPage(), 404);
}

export default {
  fetch: handleRequest,
};
