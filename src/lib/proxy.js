const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'user-agent',
  'range',
  'if-none-match',
  'if-modified-since',
  'if-range',
];

const PASS_THROUGH_HEADERS = [
  'content-type',
  'content-language',
  'cache-control',
  'expires',
  'etag',
  'last-modified',
  'vary',
  'accept-ranges',
  'content-range',
  'content-encoding',
];

export function rewriteUrl(raw, baseUrl, code) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (trimmed.startsWith('#')) return raw;
  if (/^(data|javascript|mailto|tel|sms|about|blob|vbscript):/i.test(trimmed)) return raw;
  let abs;
  try {
    abs = new URL(trimmed, baseUrl);
  } catch {
    return raw;
  }
  if (abs.origin === baseUrl.origin) {
    return `/${code}?to=${encodeURIComponent(abs.href)}`;
  }
  return raw;
}

export function rewriteSrcset(value, baseUrl, code) {
  return value
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed || /^data:/i.test(trimmed)) return part;
      const m = trimmed.match(/^(\S+)([\s\S]*)$/);
      if (!m) return part;
      const rewritten = rewriteUrl(m[1], baseUrl, code);
      if (rewritten === m[1]) return part;
      const indent = part.match(/^\s*/)[0];
      return indent + rewritten + (m[2] ? ' ' + m[2].trimStart() : '');
    })
    .join(',');
}

function rewriteMetaContent(value, baseUrl, code) {
  return value.replace(/(url\s*=\s*)(["']?)([^"'>\s]+)\2/i, (whole, prefix, quote, u) => {
    const rewritten = rewriteUrl(u, baseUrl, code);
    return rewritten === u ? whole : `${prefix}${quote}${rewritten}${quote}`;
  });
}

function attrRewriter(el, attr, baseUrl, code) {
  const value = el.getAttribute(attr);
  if (value === null || value === undefined) return;
  let next;
  if (attr === 'srcset' || attr === 'imagesrcset') {
    next = rewriteSrcset(value, baseUrl, code);
  } else {
    next = rewriteUrl(value, baseUrl, code);
  }
  if (next !== value) el.setAttribute(attr, next);
}

const REWRITE_RULES = [
  ['a', 'href'],
  ['area', 'href'],
  ['link', 'href'],
  ['script', 'src'],
  ['iframe', 'src'],
  ['img', 'src'],
  ['audio', 'src'],
  ['video', 'src'],
  ['source', 'src'],
  ['embed', 'src'],
  ['object', 'data'],
  ['form', 'action'],
  ['input', 'formaction'],
  ['button', 'formaction'],
  ['img', 'srcset'],
  ['source', 'srcset'],
];

function makeRewriter(baseUrl, code) {
  const rw = new HTMLRewriter();
  for (const [selector, attr] of REWRITE_RULES) {
    rw.on(selector, { element(el) { attrRewriter(el, attr, baseUrl, code); } });
  }
  rw.on('meta', {
    element(el) {
      const he = el.getAttribute('http-equiv');
      if (he && /refresh/i.test(he)) {
        const value = el.getAttribute('content');
        if (value) el.setAttribute('content', rewriteMetaContent(value, baseUrl, code));
      }
    },
  });
  return rw;
}

export async function proxyRequest(request, record, code) {
  const reqUrl = new URL(request.url);
  const targetUrl = new URL(record.target);
  const toParam = reqUrl.searchParams.get('to');

  let fetchUrl;
  if (toParam) {
    try {
      fetchUrl = new URL(toParam);
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }
    if (fetchUrl.origin !== targetUrl.origin) {
      return new Response('Forbidden', { status: 403 });
    }
  } else {
    fetchUrl = targetUrl;
  }

  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.delete('accept-encoding');

  const init = { method: request.method, headers, redirect: 'follow' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  let upstream;
  try {
    upstream = await fetch(fetchUrl, init);
  } catch {
    return new Response('Upstream request failed', { status: 502 });
  }

  const headersOut = new Headers();
  for (const h of PASS_THROUGH_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headersOut.set(h, v);
  }
  headersOut.set('x-robots-tag', 'noindex, nofollow');

  const contentType = upstream.headers.get('content-type') || '';
  const baseUrl = new URL(upstream.url || fetchUrl.href);

  if (
    typeof HTMLRewriter !== 'undefined' &&
    contentType.includes('text/html') &&
    (request.method === 'GET' || request.method === 'HEAD')
  ) {
    const rewriter = makeRewriter(baseUrl, code);
    return rewriter.transform(
      new Response(upstream.body, { status: upstream.status, headers: headersOut }),
    );
  }

  return new Response(upstream.body, { status: upstream.status, headers: headersOut });
}
