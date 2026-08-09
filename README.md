# 免费短链接工具（GitHub + Cloudflare Workers）

一个完全免费、无需服务器的短链接服务，代码托管在 GitHub，运行在 Cloudflare Workers（Serverless），数据存在 Cloudflare KV。

## 功能

- 短链生成：自动生成短码，也支持自定义短码
- 管理后台：`/admin` 登录后可以新建、编辑（更换目标网址）、启停、删除短链
- 密码访问：可给短链设置访问密码，验证通过后 12 小时内免密（HMAC 签名 Cookie）
- 过期时间：每条短链可单独设置过期时间，过期后自动失效，后台可随时延长
- 原网址隐藏：短链可选择「隐藏模式」（反向代理 + HTML 链接重写），访问后地址栏始终显示短链地址，不会暴露原始网址；也可选择「直接跳转」模式
- 访问统计：每条短链记录访问次数与最后访问时间
- 数据备份：后台一键导出 / 导入 JSON，方便迁移
- 安全：密码使用 PBKDF2-SHA256 加盐哈希存储；密码尝试 5 次失败后限流 10 分钟；管理会话与短链授权使用 HMAC 签名令牌

## 架构

```
用户访问短链 ──> Cloudflare Workers（短链逻辑 + 管理后台）
                    │
                    └──> Cloudflare KV（存储短链记录、哈希、令牌密钥）

代码托管 GitHub ──> GitHub Actions（wrangler）──> 自动部署到 Cloudflare Workers
```

## 免费额度（个人使用完全够用）

| 项目 | 免费额度 |
| --- | --- |
| Workers | 10 万次请求/天 |
| KV 读取 | 10 万次/天 |
| KV 写入 | 1 千次/天（每次访问会记录一次计数） |
| KV 存储 | 1 GB |

## 目录结构

```
.
├── .github/workflows/deploy.yml   # GitHub Actions 自动部署
├── src/index.js                   # Worker 入口：路由、管理 API、短链逻辑
├── src/lib/auth.js                # PBKDF2 密码哈希、HMAC 令牌
├── src/lib/proxy.js               # 隐藏模式：反向代理 + HTML 链接重写
├── src/lib/templates.js           # 管理后台 / 密码页 / 落地页
├── src/lib/helpers.js             # 工具函数
├── test/                          # 自动化测试
├── wrangler.jsonc                 # Worker 配置（KV 绑定）
└── package.json
```

## 部署步骤

### 1. 准备 Cloudflare 账号并创建 KV 命名空间

登录 [Cloudflare 控制台](https://dash.cloudflare.com)，进入 **Workers & Pages → KV**：

- 点击 **Create a namespace**，命名随意（如 `shortlink-kv`）
- 创建后复制命名空间的 **ID**（一串 32 位十六进制字符）
- 打开本项目的 `wrangler.jsonc`，把 `kv_namespaces[0].id` 从 `00000000000000000000000000000000` 替换为你的真实 ID

### 2. 推送到 GitHub

```bash
git init
git add .
git commit -m "短链接工具"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

### 3. 配置 GitHub Actions 密钥

在 Cloudflare 控制台创建 API Token：

1. 右上角头像 → **My Profile → API Tokens → Create Token**
2. 选择模板 **Edit Cloudflare Workers**（或自定义，包含 `Workers Scripts: Edit`、`Account Settings: Read`、`Workers KV Storage: Edit` 权限）
3. 复制生成的 Token

在 Cloudflare 首页右侧找到你的 **Account ID**。

然后在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中新增两个密钥：

| 名称 | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 上一步生成的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 你的 Cloudflare Account ID |

推送或点击 Actions 里的 **Run workflow**，等待部署完成。Workers 地址形如：

```
https://shortlink.<你的子域>.workers.dev
```

### 4. 设置管理员密码

首次部署后，后台会提示「尚未配置管理员密码」。二选一：

**方式 A（推荐，控制台操作）**：Workers & Pages → 你的 Worker（shortlink）→ **Settings → Variables and Secrets** → 添加 `ADMIN_PASSWORD`（类型选 Secret）→ 保存并重新部署（push 一次即可）。

**方式 B（命令行）**：

```bash
npm install
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
```

然后访问 `https://shortlink.<你的子域>.workers.dev/admin`，用该密码登录，即可开始使用。

### 5. 自定义域名（可选）

Workers & Pages → 你的 Worker → **Settings → Domains & Routes** → Add Custom Domain，输入你的域名（DNS 需托管在 Cloudflare 并开启代理）。

## 本地开发

```bash
npm install
copy .dev.vars.example .dev.vars   # 填入本地管理员密码
npm run dev                        # http://localhost:8787
npm test                           # 运行自动化测试
```

## 使用说明

进入 `/admin` 登录后：

1. **新建短链**：填目标网址；短码留空自动生成；可选择
   - 模式：**隐藏模式**（地址栏不显示原网址）或 **直接跳转**
   - 访问密码：留空则无需密码
   - 过期时间：留空则永久有效
2. **编辑**：随时更换目标网址、密码、过期时间、模式、启停状态，短码不变
3. **复制 / 访问 / 删除**：列表操作按钮
4. **导出 / 导入**：JSON 备份与迁移

## 两种模式说明

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| 隐藏模式 | Worker 代取目标页面并重写 HTML 链接，浏览器地址栏始终是短链地址 | 不想让对方看到真实网址、防止复制转发 |
| 直接跳转 | 标准 302 跳转，地址栏变为目标网址 | 普通短链加速记忆场景 |

隐藏模式尽力重写了 `a/href`、`img/src`、`script/src`、`form/action`、`srcset`、`meta refresh` 等常见属性。以下情况可能受限（属代理方案固有限制）：

- 由 JavaScript 动态生成的绝对地址、WebSocket 连接
- 需要登录态/会话 Cookie 的站点（代理不回传目标站 Cookie）
- CSS 中相对路径的图片等资源
- 禁止被代理抓取的站点

重要页面建议测试后再正式发布。

## 安全说明

- 密码以 PBKDF2-SHA256（10 万次迭代、随机盐）哈希存储，管理 API 永不返回哈希
- 短链授权与管理员会话均为 HMAC-SHA256 签名令牌，带过期时间，Cookie 为 `HttpOnly` + `SameSite=Lax`
- 密码错误 5 次后按 IP 限流 10 分钟（管理员登录与短链访问均生效）
- 短链过期后立即拒绝访问；删除后立即失效
- 修改管理员密码会同时轮换签名密钥，旧会话全部失效
- 隐藏模式下对 `?to=` 参数做了同源校验，只允许代理目标站同源资源，避免被当作开放代理

## 常见问题

**部署失败：KV namespace 找不到**
`wrangler.jsonc` 里的 `id` 还是占位符，按第 1 步替换成真实 ID 后重新推送。

**后台提示未配置管理员密码**
按第 4 步添加 `ADMIN_PASSWORD` Secret 后重新部署。

**访问量超过每天 1000 次会不会出问题**
KV 免费写入额度是 1000 次/天，每条短链的访问计数会占一次写入。个人使用足够；若访问量很大，可在 Cloudflare 后台升级 Paid（按量计费很便宜），或在代码中去掉访问计数。

**KV 数据会随部署丢失吗**
不会。KV 独立于 Worker 脚本，重新部署只更新代码，数据保留。建议定期在后台「导出数据」备份。
