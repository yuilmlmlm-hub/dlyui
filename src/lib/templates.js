import { htmlEscape } from './helpers.js';

const PAGE_CSS = 'body{font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f3f5f9;color:#1f2430;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}';
const CARD_CSS = '.card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:36px 42px;max-width:440px;text-align:center}';

export function landingPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>短链服务</title>
<style>${PAGE_CSS}${CARD_CSS}h1{margin:0 0 10px;font-size:22px}p{color:#5b6472;line-height:1.7}a{display:inline-block;margin-top:14px;background:#2f6fed;color:#fff;text-decoration:none;padding:9px 20px;border-radius:8px}</style>
</head>
<body>
<div class="card">
<h1>🔗 短链服务</h1>
<p>基于 GitHub + Cloudflare Workers 免费搭建的短链接服务。<br>支持密码访问、过期时间与原网址隐藏。</p>
<a href="/admin">进入管理后台</a>
</div>
</body>
</html>`;
}

export function passwordPage(code, error, actionUrl) {
  const errHtml = error ? `<div class="pmsg err">${htmlEscape(error)}</div>` : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>访问短链</title>
<style>${PAGE_CSS}${CARD_CSS}
.lock{font-size:40px;margin-bottom:8px}
h1{margin:0 0 4px;font-size:20px}
.muted{color:#8a93a6;font-size:13px;margin:4px 0 14px}
input{width:100%;padding:10px 12px;border:1px solid #d4d9e4;border-radius:8px;font-size:15px;box-sizing:border-box}
button{width:100%;margin-top:12px;padding:10px;border:0;border-radius:8px;background:#2f6fed;color:#fff;font-size:15px;cursor:pointer}
.pmsg{padding:9px 12px;border-radius:8px;font-size:13px;margin:12px 0}
.pmsg.err{background:#fdeaea;color:#b02a2a}
.tip{color:#9aa1af;font-size:12px;margin-top:14px}
</style>
</head>
<body>
<div class="card">
<div class="lock">🔒</div>
<h1>该链接已加密</h1>
<p class="muted">短码：${htmlEscape(code)}</p>
<p>请输入访问密码</p>
${errHtml}
<form method="post" action="${htmlEscape(actionUrl || '/' + code)}">
<input type="password" name="password" placeholder="访问密码" autocomplete="off" autofocus required>
<button type="submit">打开链接</button>
</form>
<p class="tip">验证通过后，本浏览器 12 小时内无需再次输入。</p>
</div>
</body>
</html>`;
}

export function expiredPage(code) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>链接已过期</title>
<style>${PAGE_CSS}${CARD_CSS}h1{margin:0 0 8px;font-size:20px}p{color:#5b6472;line-height:1.7}</style>
</head>
<body>
<div class="card">
<h1>⏰ 该短链已过期</h1>
<p>短码 ${htmlEscape(code)} 已超过有效时间，无法访问。<br>请联系链接发布者重新获取。</p>
</div>
</body>
</html>`;
}

export function notFoundPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>404</title>
<style>${PAGE_CSS}${CARD_CSS}h1{margin:0 0 8px;font-size:20px}p{color:#5b6472;line-height:1.7}</style>
</head>
<body>
<div class="card">
<h1>404</h1>
<p>链接不存在或已被删除。</p>
</div>
</body>
</html>`;
}

export function adminPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>短链管理后台</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f3f5f9;color:#1f2430}
.hidden{display:none!important}
header{background:#20263a;color:#fff;padding:14px 22px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
header h1{font-size:17px;margin:0 auto 0 0}
button{cursor:pointer;border:0;border-radius:6px;padding:7px 12px;font-size:13px;background:#e8ebf3;color:#1f2430}
button.primary{background:#2f6fed;color:#fff}
button.danger{background:#d64545;color:#fff}
.container{max-width:1100px;margin:20px auto;padding:0 16px}
.card{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:18px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #edf0f5;vertical-align:middle}
th{color:#6b7280;font-weight:600;background:#fafbfd}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;background:#eef2ff;color:#3a4b8a;margin-right:4px}
.badge.proxy{background:#e6f7ee;color:#17834a}
.badge.redirect{background:#fff3e0;color:#b26a00}
.badge.off{background:#fdeaea;color:#b02a2a}
.badge.expired{background:#fdeaea;color:#b02a2a}
.mono{font-family:Consolas,Menlo,monospace}
input,select,textarea{width:100%;padding:8px 10px;border:1px solid #d4d9e4;border-radius:6px;font-size:14px}
label{display:block;font-size:13px;color:#4b5563;margin:12px 0 4px}
.row{display:flex;gap:12px;flex-wrap:wrap}
.row>div{flex:1;min-width:220px}
.modal-mask{position:fixed;inset:0;background:rgba(15,20,35,.45);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:10}
.modal{background:#fff;border-radius:10px;max-width:640px;width:100%;padding:20px 24px;max-height:85vh;overflow:auto}
.login-wrap{max-width:380px;margin:80px auto}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.toolbar input{width:280px}
.msg{padding:10px 14px;border-radius:6px;margin:12px 0;font-size:13px}
.msg.err{background:#fdeaea;color:#b02a2a}
.check{display:flex;align-items:center;gap:8px}
.check input{width:auto}
.actions{display:flex;gap:6px;flex-wrap:wrap}
.muted{color:#8a93a6;font-size:12px}
a{color:#2f6fed;text-decoration:none}
</style>
</head>
<body>
<header>
<h1>🔗 短链管理后台</h1>
<button id="btn-refresh" class="hidden">刷新</button>
<button id="btn-new" class="primary hidden">新建短链</button>
<button id="btn-export" class="hidden">导出数据</button>
<button id="btn-import" class="hidden">导入数据</button>
<button id="btn-pass" class="hidden">修改密码</button>
<button id="btn-logout" class="hidden">退出登录</button>
</header>

<div class="container">
<div id="login-view" class="card login-wrap hidden">
<h2>管理员登录</h2>
<p class="muted" id="login-hint">请输入管理员密码。</p>
<label>密码</label>
<input type="password" id="login-password" autocomplete="current-password">
<div class="msg err hidden" id="login-error"></div>
<button class="primary" id="btn-login" style="margin-top:14px;width:100%">登录</button>
</div>

<div id="main-view" class="hidden">
<div class="card">
<div class="toolbar"><input type="search" id="search" placeholder="搜索短码 / 目标网址 / 备注"></div>
<table>
<thead><tr><th>短码</th><th>目标网址</th><th>模式</th><th>过期时间</th><th>访问量</th><th>状态</th><th>操作</th></tr></thead>
<tbody id="tbody"></tbody>
</table>
<p class="muted" id="empty">暂无短链，点击右上角“新建短链”。</p>
</div>
</div>
</div>

<div id="edit-modal-wrap" class="modal-mask hidden">
<div class="modal">
<h2 id="edit-title">新建短链</h2>
<div class="msg err hidden" id="edit-error"></div>
<div class="row">
<div><label>短码（留空自动生成）</label><input id="f-code" placeholder="如 mylink"></div>
<div><label>模式</label><select id="f-mode"><option value="proxy">隐藏模式（代理，不显示原网址）</option><option value="redirect">直接跳转（302）</option></select></div>
</div>
<label>目标网址</label>
<input id="f-target" placeholder="https://example.com/page">
<div class="row">
<div>
<label>访问密码（留空表示无需密码）</label>
<input id="f-password" type="password" placeholder="仅新建/换密码时填写">
<div class="check" id="pw-clear-wrap" style="display:none"><input type="checkbox" id="f-clear-password"><span>移除已有密码</span></div>
</div>
<div><label>过期时间（留空永久有效）</label><input id="f-expires" type="datetime-local"></div>
</div>
<label>备注</label>
<input id="f-note" placeholder="可选">
<div class="check" style="margin-top:12px"><input type="checkbox" id="f-enabled" checked><span>启用该短链</span></div>
<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
<button id="btn-cancel">取消</button>
<button id="btn-save" class="primary">保存</button>
</div>
</div>
</div>

<div id="pass-modal-wrap" class="modal-mask hidden">
<div class="modal">
<h2>修改管理员密码</h2>
<div class="msg err hidden" id="pass-error"></div>
<label>原密码</label><input type="password" id="p-old" autocomplete="current-password">
<label>新密码（至少6位）</label><input type="password" id="p-new" autocomplete="new-password">
<label>确认新密码</label><input type="password" id="p-new2" autocomplete="new-password">
<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
<button id="btn-pass-cancel">取消</button>
<button id="btn-pass-save" class="primary">保存</button>
</div>
</div>
</div>

<input type="file" id="import-file" accept="application/json,.json" class="hidden">
<script>
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var state = { links: [], editing: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, opts) {
    var o = opts || {};
    var init = {
      method: o.method || 'GET',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin'
    };
    if (o.body !== undefined) init.body = JSON.stringify(o.body);
    return fetch(path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || ('请求失败 (' + r.status + ')'));
          e.status = r.status;
          throw e;
        }
        return j.data;
      });
    });
  }

  function fmtTime(iso) {
    if (!iso) return '永久';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '永久';
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  function baseUrl() { return location.origin; }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { alert('已复制: ' + t); });
    }
    prompt('复制短链地址:', t);
    return Promise.resolve();
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fromLocalInput(v) {
    if (!v) return null;
    var d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function setHeaderBtns(visible) {
    ['btn-refresh', 'btn-new', 'btn-export', 'btn-import', 'btn-pass', 'btn-logout'].forEach(function (id) {
      $('#' + id).classList.toggle('hidden', !visible);
    });
  }

  function showLogin(msg) {
    $('#login-view').classList.remove('hidden');
    $('#main-view').classList.add('hidden');
    setHeaderBtns(false);
    $('#login-error').classList.add('hidden');
    if (msg) {
      $('#login-error').textContent = msg;
      $('#login-error').classList.remove('hidden');
    }
  }

  function showMain() {
    $('#login-view').classList.add('hidden');
    $('#main-view').classList.remove('hidden');
    setHeaderBtns(true);
    refresh();
  }

  function render() {
    var tbody = $('#tbody');
    tbody.innerHTML = '';
    var q = $('#search').value.trim().toLowerCase();
    var rows = state.links.filter(function (r) {
      if (!q) return true;
      return (r.code || '').toLowerCase().indexOf(q) >= 0 ||
        (r.target || '').toLowerCase().indexOf(q) >= 0 ||
        (r.note || '').toLowerCase().indexOf(q) >= 0;
    });
    $('#empty').classList.toggle('hidden', rows.length > 0);
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var expired = r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now();
      var modeText = r.mode === 'proxy' ? '隐藏' : '跳转';
      var modeCls = r.mode === 'proxy' ? 'proxy' : 'redirect';
      var status = [];
      if (!r.enabled) status.push('<span class="badge off">已停用</span>');
      else if (expired) status.push('<span class="badge expired">已过期</span>');
      else status.push('<span class="badge">启用</span>');
      if (r.hasPassword) status.push('<span class="badge">🔒 加密</span>');
      var target = r.target || '';
      var shown = target.length > 42 ? target.slice(0, 42) + '…' : target;
      tr.innerHTML =
        '<td><a class="mono" href="/' + esc(r.code) + '" target="_blank" rel="noopener">' + esc(r.code) + '</a>' +
        '<br><span class="muted">' + esc(baseUrl() + '/' + r.code) + '</span></td>' +
        '<td title="' + esc(target) + '">' + esc(shown) + '</td>' +
        '<td><span class="badge ' + modeCls + '">' + modeText + '</span></td>' +
        '<td>' + esc(fmtTime(r.expiresAt)) + '</td>' +
        '<td>' + (r.visits || 0) + '</td>' +
        '<td>' + status.join(' ') + '</td>' +
        '<td><div class="actions">' +
        '<button data-act="copy" data-code="' + esc(r.code) + '">复制</button>' +
        '<button data-act="test" data-code="' + esc(r.code) + '">访问</button>' +
        '<button data-act="edit" data-code="' + esc(r.code) + '" class="primary">编辑</button>' +
        '<button data-act="del" data-code="' + esc(r.code) + '" class="danger">删除</button>' +
        '</div></td>';
      tbody.appendChild(tr);
    });
  }

  function refresh() {
    api('/admin/api/links').then(function (data) {
      state.links = data || [];
      render();
    }).catch(function (e) {
      if (e.status === 401) showLogin('登录已过期，请重新登录。');
      else alert('加载失败: ' + e.message);
    });
  }

  function openEdit(record) {
    state.editing = record || null;
    $('#edit-title').textContent = record ? ('编辑短链 ' + record.code) : '新建短链';
    $('#f-code').value = record ? record.code : '';
    $('#f-target').value = record ? record.target : '';
    $('#f-password').value = '';
    $('#f-expires').value = toLocalInput(record ? record.expiresAt : '');
    $('#f-mode').value = record ? record.mode : 'proxy';
    $('#f-note').value = record ? (record.note || '') : '';
    $('#f-enabled').checked = record ? !!record.enabled : true;
    $('#f-clear-password').checked = false;
    $('#pw-clear-wrap').style.display = record && record.hasPassword ? 'flex' : 'none';
    $('#edit-error').classList.add('hidden');
    $('#edit-modal-wrap').classList.remove('hidden');
  }

  function closeEdit() { $('#edit-modal-wrap').classList.add('hidden'); }

  function saveEdit() {
    var body = {
      code: $('#f-code').value.trim(),
      target: $('#f-target').value.trim(),
      mode: $('#f-mode').value,
      expiresAt: fromLocalInput($('#f-expires').value),
      note: $('#f-note').value.trim(),
      enabled: $('#f-enabled').checked
    };
    var newPw = $('#f-password').value;
    if (newPw) body.newPassword = newPw;
    if ($('#f-clear-password').checked) body.clearPassword = true;
    var req = state.editing
      ? api('/admin/api/links/' + encodeURIComponent(state.editing.code), { method: 'PUT', body: body })
      : api('/admin/api/links', { method: 'POST', body: body });
    req.then(function () {
      closeEdit();
      refresh();
    }).catch(function (e) {
      $('#edit-error').textContent = e.message;
      $('#edit-error').classList.remove('hidden');
    });
  }

  $('#btn-login').addEventListener('click', function () {
    api('/admin/api/login', { method: 'POST', body: { password: $('#login-password').value } }).then(function () {
      showMain();
    }).catch(function (e) {
      $('#login-error').textContent = e.message;
      $('#login-error').classList.remove('hidden');
    });
  });
  $('#login-password').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') $('#btn-login').click();
  });
  $('#btn-logout').addEventListener('click', function () {
    api('/admin/api/logout', { method: 'POST' }).then(function () { showLogin(); });
  });
  $('#btn-refresh').addEventListener('click', refresh);
  $('#btn-new').addEventListener('click', function () { openEdit(null); });
  $('#btn-cancel').addEventListener('click', closeEdit);
  $('#btn-save').addEventListener('click', saveEdit);
  $('#search').addEventListener('input', render);

  $('#tbody').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var code = btn.getAttribute('data-code');
    if (act === 'copy') copyText(baseUrl() + '/' + code);
    else if (act === 'test') window.open(baseUrl() + '/' + code, '_blank', 'noopener');
    else if (act === 'edit') {
      var rec = state.links.find(function (r) { return r.code === code; });
      if (rec) openEdit(rec);
    } else if (act === 'del') {
      if (!confirm('确定删除短链 ' + code + ' ？删除后原地址立即失效。')) return;
      api('/admin/api/links/' + encodeURIComponent(code), { method: 'DELETE' }).then(refresh).catch(function (e) { alert(e.message); });
    }
  });

  $('#btn-export').addEventListener('click', function () {
    api('/admin/api/export').then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'shortlink-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }).catch(function (e) { alert('导出失败: ' + e.message); });
  });

  $('#btn-import').addEventListener('click', function () { $('#import-file').click(); });
  $('#import-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { alert('文件不是有效的 JSON'); return; }
      if (!Array.isArray(parsed)) { alert('JSON 格式应为短链记录数组'); return; }
      if (!confirm('将导入 ' + parsed.length + ' 条记录（相同短码会被覆盖），继续？')) return;
      api('/admin/api/import', { method: 'POST', body: { links: parsed } }).then(function (res) {
        alert('导入完成：新增 ' + res.created + ' 条，更新 ' + res.updated + ' 条');
        $('#import-file').value = '';
        refresh();
      }).catch(function (e) { alert('导入失败: ' + e.message); });
    };
    reader.readAsText(file);
  });

  $('#btn-pass').addEventListener('click', function () {
    $('#p-old').value = '';
    $('#p-new').value = '';
    $('#p-new2').value = '';
    $('#pass-error').classList.add('hidden');
    $('#pass-modal-wrap').classList.remove('hidden');
  });
  $('#btn-pass-cancel').addEventListener('click', function () { $('#pass-modal-wrap').classList.add('hidden'); });
  $('#btn-pass-save').addEventListener('click', function () {
    var oldPw = $('#p-old').value;
    var n1 = $('#p-new').value;
    var n2 = $('#p-new2').value;
    if (!oldPw || !n1) {
      $('#pass-error').textContent = '请填写原密码和新密码';
      $('#pass-error').classList.remove('hidden');
      return;
    }
    if (n1 !== n2) {
      $('#pass-error').textContent = '两次输入的新密码不一致';
      $('#pass-error').classList.remove('hidden');
      return;
    }
    api('/admin/api/password', { method: 'POST', body: { oldPassword: oldPw, newPassword: n1 } }).then(function () {
      $('#pass-modal-wrap').classList.add('hidden');
      alert('密码已修改，请重新登录。');
      showLogin();
    }).catch(function (e) {
      $('#pass-error').textContent = e.message;
      $('#pass-error').classList.remove('hidden');
    });
  });

  api('/admin/api/session').then(function () { showMain(); }).catch(function (e) {
    if (e.status === 503) {
      showLogin('管理员密码尚未配置：请在 Cloudflare 控制台给 Worker 添加 ADMIN_PASSWORD 环境变量（Secret）后重试。');
    } else {
      showLogin();
    }
  });
})();
</script>
</body>
</html>`;
}
