const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const ARTICLES_FILE = path.join(DATA_DIR, "articles.json");
const MOMENTS_FILE = path.join(DATA_DIR, "moments.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const SALT = "sxtx_atelier_salt_2026";
function hashPassword(pwd) {
  return crypto.createHash("sha256").update(pwd + SALT).digest("hex");
}

// Stateless HMAC Auth Token (Survives Server Restarts)
function generateAuthToken() {
  const expiresAt = Date.now() + 30 * 24 * 3600 * 1000; // 30 days
  const payload = `admin:${expiresAt}`;
  const sig = crypto.createHmac("sha256", SALT).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

function verifyAuthToken(token) {
  try {
    if (!token) return false;
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return false;
    const [user, expStr, sig] = parts;
    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || Date.now() > exp) return false;
    const expectedSig = crypto.createHmac("sha256", SALT).update(`${user}:${expStr}`).digest("hex");
    return sig === expectedSig;
  } catch (e) {
    return false;
  }
}

// Default config
function getOrInitConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
      adminPasswordHash: hashPassword("sxtx2026"),
      siteTitle: "Sxltx · 纸境工坊",
      siteSubtitle: "在微云之境，构筑自治的工程工作流与思想自留地。",
      author: "Sxltx",
      bio: "这里是 Sxltx 的个人工坊。记录关于云原生架构、现代极简交互与自动化系统的深度沉淀；没有浮躁的算法推荐与杂乱信息，仅保留文字、代码与运行中的造物。",
      stampText: "纸境\nATELIER"
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), "utf-8");
    return defaultConfig;
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
}

function readJSON(file, fallback = []) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

// Extract Real Client IP (Cloudflare & Reverse Proxy Guarded)
function getClientIP(req) {
  const cfIP = req.headers["cf-connecting-ip"];
  if (cfIP) return cfIP.trim();
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  const xReal = req.headers["x-real-ip"];
  if (xReal) return xReal.trim();
  return req.socket.remoteAddress || "127.0.0.1";
}

// In-Memory Sliding-Window Rate Limiter for Messages
const messageRateMap = new Map(); // IP -> { lastPostTime, count, windowStart, lastContentHash }
function checkMessageRateLimit(ip, content) {
  const now = Date.now();
  const record = messageRateMap.get(ip) || { lastPostTime: 0, count: 0, windowStart: now, lastContentHash: "" };

  // Rule 1: 15-second mandatory cooldown between consecutive posts
  if (now - record.lastPostTime < 15000) {
    const waitSec = Math.ceil((15000 - (now - record.lastPostTime)) / 1000);
    return { allowed: false, error: `心诚则灵，留言请沉思静气。请等待 ${waitSec} 秒后再试` };
  }

  // Rule 2: 10-minute sliding window max 5 messages
  if (now - record.windowStart > 10 * 60 * 1000) {
    record.count = 0;
    record.windowStart = now;
  }
  if (record.count >= 5) {
    return { allowed: false, error: "您在短时间内留墨较多，工坊已收到您的心意，请稍歇片刻。" };
  }

  // Rule 3: Deduplication
  const contentHash = crypto.createHash("md5").update(content.trim()).digest("hex");
  if (record.lastContentHash === contentHash && (now - record.lastPostTime < 120000)) {
    return { allowed: false, error: "请勿重复提交相同内容的墨痕。" };
  }

  // Update record on success
  record.lastPostTime = now;
  record.count += 1;
  record.lastContentHash = contentHash;
  messageRateMap.set(ip, record);

  // Clean old entries if map grows too large
  if (messageRateMap.size > 2000) {
    for (const [k, v] of messageRateMap.entries()) {
      if (now - v.lastPostTime > 3600000) messageRateMap.delete(k);
    }
  }

  return { allowed: true };
}

// Parse cookies
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    let [name, ...rest] = cookie.split("=");
    name = name.trim();
    if (!name) return;
    const value = rest.join("=").trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

// Check admin auth
function isAuthenticated(req) {
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (verifyAuthToken(token)) return true;
  }
  const cookies = parseCookies(req.headers["cookie"]);
  if (cookies["atelier_session"] && verifyAuthToken(cookies["atelier_session"])) {
    return true;
  }
  return false;
}

// Universal Response Sender with Strict Security Headers, Gzip, ETag & Cache Isolation
function sendResponse(req, res, statusCode, contentType, body, isCacheable = false) {
  let buffer = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf-8");
  const hash = crypto.createHash("md5").update(buffer).digest("hex");
  const etag = `W/"${hash}"`;

  const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  const isAPI = pathname.startsWith("/api") || contentType.includes("json");
  const isHTML = contentType.includes("text/html");
  const isDynamicMeta = pathname === "/rss.xml" || pathname === "/sitemap.xml" || pathname === "/robots.txt";
  const isNeverCache = isAPI || isHTML || isDynamicMeta || pathname === "/sw.js" || pathname.startsWith("/article/");

  if (!isNeverCache && req.headers["if-none-match"] === etag) {
    res.writeHead(304, {
      "ETag": etag,
      "Cache-Control": isCacheable ? "public, max-age=31536000, immutable" : "no-cache, must-revalidate",
      "Vary": "Accept-Encoding"
    });
    res.end();
    return;
  }

  // 1. Full Production-Grade Security Headers
  const headers = {
    "Content-Type": contentType,
    "Vary": "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
  };

  // 2. Strict Cache-Busting for HTML, API, RSS & Sitemap
  if (isNeverCache) {
    headers["Cache-Control"] = "private, no-cache, no-store, max-age=0, must-revalidate";
    headers["CDN-Cache-Control"] = "private, no-cache, no-store, max-age=0, must-revalidate";
    headers["Cloudflare-CDN-Cache-Control"] = "private, no-cache, no-store, max-age=0, must-revalidate";
    headers["Pragma"] = "no-cache";
    headers["Expires"] = "0";
    headers["ETag"] = `W/"${Date.now()}-${hash.slice(0, 8)}"`; // Dynamic ETag defeats edge proxy stale caching
  } else if (isCacheable) {
    const hasVersion = req.url && (req.url.includes("?v=") || req.url.includes("&v="));
    if (hasVersion) {
      headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=86400";
      headers["CDN-Cache-Control"] = "max-age=86400";
      headers["Cloudflare-CDN-Cache-Control"] = "max-age=86400";
    } else {
      headers["Cache-Control"] = "public, max-age=60, must-revalidate";
      headers["CDN-Cache-Control"] = "max-age=120";
      headers["Cloudflare-CDN-Cache-Control"] = "max-age=120";
    }
    headers["ETag"] = etag;
  } else {
    headers["Cache-Control"] = "public, max-age=60, must-revalidate";
    headers["ETag"] = etag;
  }

  const acceptEncoding = req.headers["accept-encoding"] || "";
  if (acceptEncoding.includes("gzip") && buffer.length > 384) {
    zlib.gzip(buffer, (err, compressed) => {
      if (!err) {
        headers["Content-Encoding"] = "gzip";
        headers["Content-Length"] = compressed.length;
        res.writeHead(statusCode, headers);
        res.end(compressed);
      } else {
        headers["Content-Length"] = buffer.length;
        res.writeHead(statusCode, headers);
        res.end(buffer);
      }
    });
  } else {
    headers["Content-Length"] = buffer.length;
    res.writeHead(statusCode, headers);
    res.end(buffer);
  }
}

function sendJSON(req, res, statusCode, data, isCacheable = false) {
  sendResponse(req, res, statusCode, "application/json; charset=utf-8", JSON.stringify(data), isCacheable);
}

// Request body parser helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

// Dynamic RSS 2.0 Generator (Always up to date with 100% articles)
function generateDynamicRSS() {
  const articles = readJSON(ARTICLES_FILE, []);
  const config = getOrInitConfig();
  const siteUrl = "https://hlat.top";

  const itemsXML = articles.map(art => {
    const postUrl = `${siteUrl}/article/${art.slug || art.id}`;
    const pubDate = new Date(art.date || Date.now()).toUTCString();
    const title = (art.title || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const summary = (art.summary || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const category = (art.category || "随笔").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    return `    <item>
      <title>${title}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <category>${category}</category>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${art.summary || art.title}]]></description>
      <author>sxtx@hlat.top (${config.author || "Sxltx"})</author>
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${config.siteTitle || "Sxltx · 纸境工坊"}</title>
    <link>${siteUrl}</link>
    <description>${config.bio || "在微云之境，构筑自治的工程工作流与思想自留地。"}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/og/default.png</url>
      <title>${config.siteTitle || "Sxltx · 纸境工坊"}</title>
      <link>${siteUrl}</link>
    </image>
${itemsXML}
  </channel>
</rss>`;
}

// Dynamic Sitemap Generator
function generateDynamicSitemap() {
  const articles = readJSON(ARTICLES_FILE, []);
  const siteUrl = "https://hlat.top";

  const urlElements = [
    `  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`
  ];

  articles.forEach(art => {
    urlElements.push(`  <url>
    <loc>${siteUrl}/article/${art.slug || art.id}</loc>
    <lastmod>${art.date || new Date().toISOString().slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>`);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements.join("\n")}
</urlset>`;
}

// Dynamic Article Prerender & SEO Injection
function renderArticlePage(req, res, article) {
  const indexHtmlPath = path.join(PUBLIC_DIR, "index.html");
  let html = fs.readFileSync(indexHtmlPath, "utf-8");

  const siteUrl = "https://hlat.top";
  const postUrl = `${siteUrl}/article/${article.slug || article.id}`;
  const ogImgUrl = `${siteUrl}/og/${article.slug || article.id}.png`;
  const cleanTitle = `${article.title} · Sxltx 纸境工坊`;
  const cleanDesc = article.summary || `${article.title} - Sxltx 的独立个人工坊思考与造物沉淀。`;

  // 1. Dynamic Title
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${cleanTitle}</title>`);

  // 2. Canonical URL (Individually Pointed to This Article)
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"/i, `<link rel="canonical" href="${postUrl}"`);

  // 3. Meta Description
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"/i, `<meta name="description" content="${cleanDesc}">`);

  // 4. OpenGraph Meta Tags
  html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"/i, `<meta property="og:url" content="${postUrl}">`);
  html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"/i, `<meta property="og:title" content="${cleanTitle}">`);
  html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"/i, `<meta property="og:description" content="${cleanDesc}">`);
  html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"/i, `<meta property="og:image" content="${ogImgUrl}">`);

  // 5. Twitter Card Meta Tags (1200x630 Large Card)
  html = html.replace(/<meta\s+name="twitter:card"\s+content="[^"]*"/i, `<meta name="twitter:card" content="summary_large_image">`);
  html = html.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"/i, `<meta name="twitter:title" content="${cleanTitle}">`);
  html = html.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"/i, `<meta name="twitter:description" content="${cleanDesc}">`);
  html = html.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"/i, `<meta name="twitter:image" content="${ogImgUrl}">`);

  // 6. Schema.org BlogPosting Structured Data (Rich Snippets for Google & Bing)
  const schemaOrg = `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": ${JSON.stringify(article.title)},
    "description": ${JSON.stringify(cleanDesc)},
    "image": ${JSON.stringify(ogImgUrl)},
    "datePublished": ${JSON.stringify(article.date || "2026-11-04")},
    "dateModified": ${JSON.stringify(article.date || "2026-11-04")},
    "author": {
      "@type": "Person",
      "name": "Sxltx",
      "url": "https://hlat.top"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Sxltx · 纸境工坊",
      "logo": {
        "@type": "ImageObject",
        "url": "https://hlat.top/og/default.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": ${JSON.stringify(postUrl)}
    }
  }
  </script>
  `;
  html = html.replace("</head>", `${schemaOrg}\n</head>`);

  // 7. Prerender Content into #reader-title, #reader-summary and #reader-content
  html = html.replace(/<h1[^>]*id="reader-title"[^>]*><\/h1>/i, `<h1 class="drawer-title" id="reader-title">${article.title}</h1>`);
  html = html.replace(/<p[^>]*id="reader-summary"[^>]*><\/p>/i, `<p class="drawer-summary" id="reader-summary">${article.summary || ''}</p>`);

  const prerenderBody = `
    <article class="ssr-prerender-article" style="display:block;">
      <div class="reader-meta-row" style="margin:0.8rem 0 1.2rem;color:var(--text-muted);font-family:var(--font-mono);font-size:0.85rem;">
        <span class="pill-badge">${article.category || '随笔'}</span> · 
        <span>${article.date || ''}</span> · 
        <span>${article.readTime || '5 分钟'}</span>
      </div>
      <div class="reader-body">
        ${article.content.replace(/\n\n/g, '<br><br>')}
      </div>
    </article>
  `;
  html = html.replace(/<div[^>]*id="reader-content"[^>]*><\/div>/i, `<div class="markdown-rendered-content" id="reader-content">${prerenderBody}</div>`);

  sendResponse(req, res, 200, "text/html; charset=utf-8", html, false);
}

// MIME Types
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  // 1. Dynamic RSS Feed (Real-time, Never Cached by Proxy)
  if (pathname === "/rss.xml" && method === "GET") {
    const rssContent = generateDynamicRSS();
    return sendResponse(req, res, 200, "application/xml; charset=utf-8", rssContent, false);
  }

  // 2. Dynamic Sitemap
  if (pathname === "/sitemap.xml" && method === "GET") {
    const sitemapContent = generateDynamicSitemap();
    return sendResponse(req, res, 200, "application/xml; charset=utf-8", sitemapContent, false);
  }

  // 3. Article Direct SSR Route (/article/:slug)
  const articleRouteMatch = pathname.match(/^\/article\/([^/]+)$/);
  if (articleRouteMatch && method === "GET") {
    const slug = decodeURIComponent(articleRouteMatch[1]);
    const articles = readJSON(ARTICLES_FILE, []);
    const art = articles.find(a => (a.slug && a.slug === slug) || a.id === slug);
    if (art) {
      return renderArticlePage(req, res, art);
    }
  }

  // API Routes
  // 1. Auth Status
  if (pathname === "/api/auth/status" && method === "GET") {
    return sendJSON(req, res, 200, { authenticated: isAuthenticated(req) });
  }

  // 2. Auth Login
  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await parseBody(req);
    const config = getOrInitConfig();
    const inputHash = hashPassword(body.password || "");
    if (inputHash === config.adminPasswordHash) {
      const token = generateAuthToken();
      res.setHeader("Set-Cookie", `atelier_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return sendJSON(req, res, 200, { ok: true, token });
    } else {
      return sendJSON(req, res, 401, { ok: false, error: "口令错误" });
    }
  }

  // 3. Auth Logout
  if (pathname === "/api/auth/logout" && method === "POST") {
    res.setHeader("Set-Cookie", "atelier_session=; Path=/; HttpOnly; Max-Age=0");
    return sendJSON(req, res, 200, { ok: true });
  }

  // 4. Change Password
  if (pathname === "/api/auth/password" && method === "POST") {
    if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
    const body = await parseBody(req);
    if (!body.newPassword || body.newPassword.length < 4) {
      return sendJSON(req, res, 400, { ok: false, error: "新密码至少需要4个字符" });
    }
    const config = getOrInitConfig();
    config.adminPasswordHash = hashPassword(body.newPassword);
    writeJSON(CONFIG_FILE, config);
    return sendJSON(req, res, 200, { ok: true, message: "管理口令修改成功" });
  }

  // 5. Config (Public Read, Protected Write)
  if (pathname === "/api/config") {
    if (method === "GET") {
      const config = getOrInitConfig();
      const publicConfig = {
        siteTitle: config.siteTitle || "Sxltx · 纸境工坊",
        siteSubtitle: config.siteSubtitle || "",
        author: config.author || "Sxltx",
        bio: config.bio || "",
        stampText: config.stampText || "纸境\nATELIER",
        hasGlmKey: !!(config.glmApiKey || process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY),
        glmApiKeyMasked: config.glmApiKey ? (config.glmApiKey.slice(0, 4) + '••••' + config.glmApiKey.slice(-4)) : ''
      };
      return sendJSON(req, res, 200, publicConfig, false);
    }
    if (method === "POST") {
      if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
      const body = await parseBody(req);
      const config = getOrInitConfig();
      if (body.siteTitle) config.siteTitle = String(body.siteTitle).slice(0, 100);
      if (body.siteSubtitle !== undefined) config.siteSubtitle = String(body.siteSubtitle).slice(0, 200);
      if (body.author) config.author = String(body.author).slice(0, 50);
      if (body.bio !== undefined) config.bio = String(body.bio).slice(0, 500);
      if (body.stampText !== undefined) config.stampText = String(body.stampText).slice(0, 30);
      if (body.glmApiKey !== undefined) config.glmApiKey = String(body.glmApiKey).trim();
      writeJSON(CONFIG_FILE, config);
      return sendJSON(req, res, 200, { ok: true, config });
    }
  }

  // 6. Articles API
  if (pathname === "/api/articles") {
    if (method === "GET") {
      const articles = readJSON(ARTICLES_FILE, []);
      return sendJSON(req, res, 200, { ok: true, articles });
    }
    if (method === "POST") {
      if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
      const body = await parseBody(req);
      if (!body.title) return sendJSON(req, res, 400, { ok: false, error: "标题不能为空" });
      const articles = readJSON(ARTICLES_FILE, []);
      const newArticle = {
        id: "art_" + Date.now().toString(36),
        title: String(body.title).trim(),
        slug: body.slug ? String(body.slug).trim() : "post-" + Date.now().toString(36),
        category: body.category ? String(body.category).trim() : "随笔",
        date: body.date || new Date().toISOString().slice(0, 10),
        readTime: body.readTime || "3 分钟",
        summary: body.summary ? String(body.summary).trim() : "",
        content: body.content ? String(body.content) : ""
      };
      articles.unshift(newArticle);
      writeJSON(ARTICLES_FILE, articles);
      return sendJSON(req, res, 201, { ok: true, article: newArticle });
    }
  }

  // Article single operations (PUT / DELETE)
  const articleMatch = pathname.match(/^\/api\/articles\/([^/]+)$/);
  if (articleMatch) {
    const artId = articleMatch[1];
    const articles = readJSON(ARTICLES_FILE, []);
    const idx = articles.findIndex((a) => a.id === artId || a.slug === artId);

    if (method === "GET") {
      if (idx === -1) return sendJSON(req, res, 404, { ok: false, error: "文章不存在" });
      return sendJSON(req, res, 200, { ok: true, article: articles[idx] });
    }
    if (method === "PUT") {
      if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
      if (idx === -1) return sendJSON(req, res, 404, { ok: false, error: "文章不存在" });
      const body = await parseBody(req);
      if (body.title) articles[idx].title = String(body.title).trim();
      if (body.slug) articles[idx].slug = String(body.slug).trim();
      if (body.category) articles[idx].category = String(body.category).trim();
      if (body.date) articles[idx].date = String(body.date).trim();
      if (body.readTime) articles[idx].readTime = String(body.readTime).trim();
      if (body.summary !== undefined) articles[idx].summary = String(body.summary).trim();
      if (body.content !== undefined) articles[idx].content = String(body.content);
      writeJSON(ARTICLES_FILE, articles);
      return sendJSON(req, res, 200, { ok: true, article: articles[idx] });
    }
    if (method === "DELETE") {
      if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
      if (idx === -1) return sendJSON(req, res, 404, { ok: false, error: "文章不存在" });
      const removed = articles.splice(idx, 1)[0];
      writeJSON(ARTICLES_FILE, articles);
      return sendJSON(req, res, 200, { ok: true, removed });
    }
  }

  // 7. Moments API
  if (pathname === "/api/moments") {
    if (method === "GET") {
      const moments = readJSON(MOMENTS_FILE, []);
      return sendJSON(req, res, 200, { ok: true, moments });
    }
    if (method === "POST") {
      if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
      const body = await parseBody(req);
      if (!body.content) return sendJSON(req, res, 400, { ok: false, error: "微语内容不能为空" });
      const moments = readJSON(MOMENTS_FILE, []);
      const newMoment = {
        id: "mom_" + Date.now().toString(36),
        content: String(body.content).trim(),
        tag: body.tag ? String(body.tag).replace(/^#/, "").trim() : "随想",
        time: new Date().toISOString()
      };
      moments.unshift(newMoment);
      writeJSON(MOMENTS_FILE, moments);
      return sendJSON(req, res, 201, { ok: true, moment: newMoment });
    }
  }

  const momentMatch = pathname.match(/^\/api\/moments\/([^/]+)$/);
  if (momentMatch && method === "DELETE") {
    if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
    const momId = momentMatch[1];
    const moments = readJSON(MOMENTS_FILE, []);
    const idx = moments.findIndex((m) => m.id === momId);
    if (idx !== -1) {
      moments.splice(idx, 1);
      writeJSON(MOMENTS_FILE, moments);
    }
    return sendJSON(req, res, 200, { ok: true });
  }

  // Smart Echo Generator for Guestbook (Supports GLM-4-Flash & Local Semantic Engine)
  async function generateSmartEcho(content, author) {
    const text = (content || "").toLowerCase();
    const config = getOrInitConfig();
    const glmKey = process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || config.glmApiKey;

    if (glmKey) {
      try {
        const resp = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${glmKey.trim()}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "glm-4-flash",
            messages: [
              {
                role: "system",
                content: "你是独立技术博客「纸境工坊」的主理人Sxltx。工坊技术栈：Node.js极简原生服务、轻量云主机4核8G、Cloudflare全球隧道直连、腾讯云EdgeOne加速、严格禁用stale-if-error死锁、前端Auto-Bust版本指纹自愈。你在博客留言薄（Guestbook）上给访客回墨。准则：1.【切中主题，针对性强】：必须针对访客提到的具体问题、技术话题或感悟做实质性回应。如果是提问，必须结合你的真实工程实践给出干货解答，严禁答非所问；2.【拒绝假大空与AI虚假套话】：严禁使用“茶香一盏待君再续前缘”、“水墨丹青”、“字字如金”等假大空古风废话。说话要像一个真正动手写代码、懂工程实战、真诚谦逊的活人技术博主；3.【务实克制】：语气自然真诚，条理清晰，字数控制在80~180字之间。"
              },
              {
                role: "user",
                content: `访客称谓：${author || '墨友'}\n留墨内容：${content}`
              }
            ],
            temperature: 0.4,
            max_tokens: 300
          }),
          signal: AbortSignal.timeout(9000)
        });

        if (resp.ok) {
          const data = await resp.json();
          const aiReply = data?.choices?.[0]?.message?.content?.trim();
          if (aiReply) {
            return {
              author: "工坊回笔 · GLM",
              content: aiReply,
              time: new Date().toISOString()
            };
          }
        } else {
          console.warn("[GLM] API call failed with status", resp.status);
        }
      } catch (err) {
        console.warn("[GLM] Error invoking GLM API:", err.message);
      }
    }

    // Fallback: Intelligent Semantic Intent Matching Engine
    let echoContent = "";
    const isQuestion = text.includes("？") || text.includes("?") || text.includes("怎么") || text.includes("如何") || text.includes("请教") || text.includes("为什么") || text.includes("何解");

    if (isQuestion) {
      echoContent = `敬复【${author || '墨友'}】：感谢您的深入探讨。关于您提及的具体工程细节与疑问，工坊已妥善归档入卷；因涉及架构深层实现，稍后主理人会在控制台为您补充详尽复盘，欢迎持续交流。`;
    } else if (text.includes("设计") || text.includes("纸") || text.includes("排版") || text.includes("好看") || text.includes("优雅") || text.includes("美") || text.includes("风格") || text.includes("质感") || text.includes("留白")) {
      echoContent = `致【${author || '墨友'}】：见字如面。取竹尾素纸之纯粹，敛数字荧幕之浮光。工坊守拙于纸墨之间，很欣喜遇见懂这份克制审美的同道知音。`;
    } else if (text.includes("技术") || text.includes("架构") || text.includes("云") || text.includes("node") || text.includes("服务器") || text.includes("代码") || text.includes("部署") || text.includes("vps") || text.includes("开源") || text.includes("延迟") || text.includes("网络") || text.includes("cdn") || text.includes("缓存")) {
      echoContent = `致【${author || '墨友'}】：同道中人。在喧嚣的网络层之下，构筑干净、自洽且可靠的自治系统，是最纯粹的工程乐趣。愿代码常健，运行无阻。`;
    } else if (text.includes("生活") || text.includes("加油") || text.includes("坚持") || text.includes("心境") || text.includes("思考") || text.includes("迷茫") || text.includes("未来") || text.includes("岁月") || text.includes("时间")) {
      echoContent = `致【${author || '墨友'}】：纸境虽小，亦能观天地。万物皆有其沉淀的节律，不必急于求成，在静默处扎根，春华自有时。感谢您的真挚驻足。`;
    } else {
      echoContent = `致【${author || '墨友'}】：山川辽阔，比特相连。感谢旅人驻足留墨，文字有余温，工坊随时欢迎常来坐坐。`;
    }

    return {
      author: "工坊回笔",
      content: echoContent,
      time: new Date().toISOString()
    };
  }

  // 8. Messages (Guestbook) API with Advanced Anti-Spam Rate Limiting & Honeypot
  if (pathname === "/api/messages") {
    if (method === "GET") {
      const messages = readJSON(MESSAGES_FILE, []);
      return sendJSON(req, res, 200, { ok: true, messages });
    }
    if (method === "POST") {
      const body = await parseBody(req);
      
      // Honeypot Protection: Bots usually auto-fill hidden input fields
      if (body.website || body.honeypot || body.hp_token) {
        console.warn(`[AntiSpam] Bot detected via honeypot from ${getClientIP(req)}`);
        return sendJSON(req, res, 200, { ok: true, message: { id: "bot_ignored" } }); // Silent discard
      }

      if (!body.content || !body.content.trim()) {
        return sendJSON(req, res, 400, { ok: false, error: "留言内容不能为空" });
      }

      const clientIP = getClientIP(req);
      const rateCheck = checkMessageRateLimit(clientIP, body.content);
      if (!rateCheck.allowed) {
        return sendJSON(req, res, 429, { ok: false, error: rateCheck.error });
      }

      const messages = readJSON(MESSAGES_FILE, []);
      const echoData = await generateSmartEcho(body.content, body.author);
      const newMsg = {
        id: "msg_" + Date.now().toString(36),
        author: body.author ? String(body.author).trim().slice(0, 30) : "无名墨友",
        content: String(body.content).trim().slice(0, 500),
        time: new Date().toISOString(),
        echo: echoData
      };
      messages.unshift(newMsg);
      if (messages.length > 200) messages.length = 200;
      writeJSON(MESSAGES_FILE, messages);
      return sendJSON(req, res, 201, { ok: true, message: newMsg });
    }
  }

  // Message Reply API
  const msgReplyMatch = pathname.match(/^\/api\/messages\/([^/]+)\/reply$/);
  if (msgReplyMatch && (method === "POST" || method === "PUT")) {
    if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
    const msgId = msgReplyMatch[1];
    const body = await parseBody(req);
    const messages = readJSON(MESSAGES_FILE, []);
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return sendJSON(req, res, 404, { ok: false, error: "留言不存在" });

    const replyContent = String(body.content || "").trim();
    if (!replyContent) {
      delete messages[idx].echo;
    } else {
      messages[idx].echo = {
        author: body.author ? String(body.author).trim() : "工坊回笔",
        content: replyContent,
        time: new Date().toISOString()
      };
    }
    writeJSON(MESSAGES_FILE, messages);
    return sendJSON(req, res, 200, { ok: true, message: messages[idx] });
  }

  const msgMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (msgMatch && method === "DELETE") {
    if (!isAuthenticated(req)) return sendJSON(req, res, 403, { ok: false, error: "未授权" });
    const msgId = msgMatch[1];
    const messages = readJSON(MESSAGES_FILE, []);
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx !== -1) {
      messages.splice(idx, 1);
      writeJSON(MESSAGES_FILE, messages);
    }
    return sendJSON(req, res, 200, { ok: true });
  }

  // 9. Status API
  if (pathname === "/api/status" && method === "GET") {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const uptimeSec = os.uptime();
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = Math.floor(uptimeSec % 60);

    return sendJSON(req, res, 200, {
      ok: true,
      host: os.hostname(),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      uptime: `${hours}小时 ${mins}分 ${secs}秒`,
      uptimeSeconds: uptimeSec,
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0] ? os.cpus()[0].model : "AMD EPYC",
        load: os.loadavg()
      },
      memory: {
        totalGiB: (totalMem / 1073741824).toFixed(2),
        usedGiB: (usedMem / 1073741824).toFixed(2),
        freeGiB: (freeMem / 1073741824).toFixed(2),
        usedPercent: Math.round((usedMem / totalMem) * 100)
      },
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    });
  }

  // Static File Serving
  let relativePath = pathname === "/" ? "index.html" : pathname;
  // Fallback for SPA routing /admin
  if (pathname === "/admin") {
    relativePath = "index.html";
  }

  let filePath = path.join(PUBLIC_DIR, relativePath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const isDynamicMeta = pathname === "/sitemap.xml" || pathname === "/robots.txt" || pathname === "/rss.xml";
    const isCacheable = ext !== ".html" && pathname !== "/sw.js" && !isDynamicMeta;
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end("Internal Server Error");
      } else {
        sendResponse(req, res, 200, mime, content, isCacheable);
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sxltx Atelier Studio Server running on port ${PORT}`);
});
