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

// Session store in memory
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
      siteTitle: "Sxtx · 纸境工坊",
      siteSubtitle: "在微云之境，构筑自治的工程工作流与思想自留地。",
      author: "Sxtx",
      bio: "这里是 Sxtx 的个人工坊。记录关于云原生架构、现代极简交互与自动化系统的深度沉淀；没有浮躁的算法推荐与杂乱信息，仅保留文字、代码与运行中的造物。",
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

// Helpers for reading/writing JSON
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

// Universal Response Sender with Gzip, ETag & Caching
function sendResponse(req, res, statusCode, contentType, body, isCacheable = false) {
  let buffer = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf-8");
  const hash = crypto.createHash("md5").update(buffer).digest("hex");
  const etag = `W/"${hash}"`;

  const isAPI = req.url.startsWith("/api") || contentType.includes("json");
  const isHTML = contentType.includes("text/html");

  if (!isAPI && req.headers["if-none-match"] === etag) {
    res.writeHead(304, {
      "ETag": etag,
      "Cache-Control": isCacheable ? "public, max-age=31536000, immutable" : "no-cache, must-revalidate",
      "Vary": "Accept-Encoding"
    });
    res.end();
    return;
  }

  const headers = {
    "Content-Type": contentType,
    "ETag": etag,
    "Vary": "Accept-Encoding",
    "X-Content-Type-Options": "nosniff"
  };

  if (isAPI || isHTML || req.url === '/sw.js' || req.url.startsWith('/sw.js')) {
    // APIs, HTML pages and Service Worker must NEVER be cached by CDN or browser
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0";
    headers["CDN-Cache-Control"] = "no-store";
    headers["Cloudflare-CDN-Cache-Control"] = "no-store";
    headers["Pragma"] = "no-cache";
    headers["Expires"] = "0";
  } else if (isCacheable) {
    // Versioned static assets (?v=...) can be cached long-term for max performance
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
    headers["CDN-Cache-Control"] = "max-age=31536000";
    headers["Cloudflare-CDN-Cache-Control"] = "max-age=31536000";
  } else {
    headers["Cache-Control"] = "no-cache, must-revalidate, max-age=0";
    headers["CDN-Cache-Control"] = "no-cache";
    headers["Cloudflare-CDN-Cache-Control"] = "no-cache";
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
    const cookies = parseCookies(req.headers["cookie"]);
    if (cookies["atelier_session"]) {
      // Stateless token - cookie cleared by Set-Cookie
    }
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
        siteTitle: config.siteTitle || "Sxtx · 纸境工坊",
        siteSubtitle: config.siteSubtitle || "",
        author: config.author || "Sxtx",
        bio: config.bio || "",
        stampText: config.stampText || "纸境\nATELIER"
      };
      return sendJSON(req, res, 200, publicConfig, true);
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

  
function generateSmartEcho(content, author) {
  const text = (content || "").toLowerCase();
  let echoContent = "";
  
  if (text.includes("设计") || text.includes("纸") || text.includes("排版") || text.includes("好看") || text.includes("优雅") || text.includes("美") || text.includes("风格") || text.includes("质感") || text.includes("留白")) {
    echoContent = "见字如面。取竹尾素纸之纯粹，敛数字荧幕之浮光。工坊守拙于纸墨之间，很欣喜遇见懂这份克制审美的同道知音。";
  } else if (text.includes("技术") || text.includes("架构") || text.includes("云") || text.includes("node") || text.includes("服务器") || text.includes("代码") || text.includes("部署") || text.includes("vps") || text.includes("开源") || text.includes("延迟") || text.includes("网络")) {
    echoContent = "同道中人。在喧嚣的网络层之下，构筑干净、自洽且可靠的自治系统，是最纯粹的工程乐趣。愿代码常健，运行无阻。";
  } else if (text.includes("生活") || text.includes("加油") || text.includes("坚持") || text.includes("心境") || text.includes("思考") || text.includes("迷茫") || text.includes("未来") || text.includes("岁月") || text.includes("时间")) {
    echoContent = "纸境虽小，亦能观天地。万物皆有其沉淀的节律，不必急于求成，在静默处扎根，春华自有时。感谢您的真挚驻足。";
  } else if (text.includes("你好") || text.includes("hello") || text.includes("hi") || text.includes("支持") || text.includes("逛逛") || text.includes("打卡") || text.includes("来看看") || text.includes("路过")) {
    echoContent = "山川辽阔，比特相连。感谢旅人驻足留墨，数字世界的这一隅自留地，随时欢迎您常来坐坐。";
  } else {
    echoContent = "感谢旅人驻足留墨。微云过隙，字有余温。在数字世界的这一隅自留地，很荣幸与您的思想产生共振。";
  }

  return {
    author: "工坊回笔",
    content: echoContent,
    time: new Date().toISOString()
  };
}

// 8. Messages (Guestbook) API
  if (pathname === "/api/messages") {
    if (method === "GET") {
      const messages = readJSON(MESSAGES_FILE, []);
      return sendJSON(req, res, 200, { ok: true, messages });
    }
    if (method === "POST") {
      const body = await parseBody(req);
      if (!body.content || !body.content.trim()) {
        return sendJSON(req, res, 400, { ok: false, error: "留言内容不能为空" });
      }
      const messages = readJSON(MESSAGES_FILE, []);
      const newMsg = {
        id: "msg_" + Date.now().toString(36),
        author: body.author ? String(body.author).trim().slice(0, 30) : "无名墨友",
        content: String(body.content).trim().slice(0, 500),
        time: new Date().toISOString(),
        echo: generateSmartEcho(body.content, body.author)
      };
      messages.unshift(newMsg);
      if (messages.length > 200) messages.length = 200;
      writeJSON(MESSAGES_FILE, messages);
      return sendJSON(req, res, 201, { ok: true, message: newMsg });
    }
  }

    // Message Reply API (Owner/Admin reply to visitor message)
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

  // 9. Status API (Privacy Guarded - NO PROXY DATA)
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
  // Fallback for SPA routing /admin, /article/*
  if (pathname === "/admin" || pathname.startsWith("/article/")) {
    relativePath = "index.html";
  }

  let filePath = path.join(PUBLIC_DIR, relativePath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const isDynamicMeta = pathname === '/sitemap.xml' || pathname === '/robots.txt' || pathname === '/rss.xml';
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
  console.log(`Sxtx Atelier Studio Server running on port ${PORT}`);
});
