
// Inject typography styles dynamically (guaranteed first-line indent 2em & clean typography)
(function injectTypography() {
  const style = document.createElement('style');
  style.id = 'atelier-typography-rules';
  style.textContent = `
    .featured-summary,
    .art-desc,
    #reader-content p,
    .article-content p,
    .reader-body p {
      text-indent: 2em !important;
      text-align: justify !important;
    }
    #reader-content pre,
    #reader-content code,
    #reader-content ul,
    #reader-content ol,
    #reader-content li,
    #reader-content blockquote,
    #reader-content h1,
    #reader-content h2,
    #reader-content h3,
    #reader-content h4,
    .ai-insight-card,
    .ai-insight-card p,
    .ai-insight-card li,
    .ai-insight-card ul,
    .code-block-wrapper,
    .code-block-wrapper p {
      text-indent: 0 !important;
    }
  `;
  if (!document.getElementById('atelier-typography-rules')) {
    document.head.appendChild(style);
  }
})();
// --------------------------------------------------------------------------
// 0. Release Fingerprint & Auto-Busting Cache Healer
// --------------------------------------------------------------------------
const CURRENT_RELEASE_VER = '20261104_v6';
try {
  if (localStorage.getItem('atelier_ver') !== CURRENT_RELEASE_VER) {
    localStorage.setItem('atelier_ver', CURRENT_RELEASE_VER);
    localStorage.setItem('sxtx-atelier-theme', 'paper');
    document.documentElement.setAttribute('data-theme', 'paper');
    localStorage.removeItem('atelier_articles');
    localStorage.removeItem('atelier_moments');
    localStorage.removeItem('atelier_config');
    localStorage.removeItem('atelier_messages');
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (let r of regs) r.unregister();
      });
    }
  }
} catch (e) {
  console.warn('Auto-healer error:', e);
}

/**
 * Sxtx · 纸境工坊 · Studio Core Engine
 * Zero Heavy Bundler · Stale-While-Revalidate · Instant Load
 */


// Ludi Video 3 & 9: Semantic Badges & Segmented Radio Control
function getCatClass(cat) {
  if (cat === '技术') return 'cat-badge-tech';
  if (cat === '设计') return 'cat-badge-design';
  if (cat === '随笔') return 'cat-badge-essay';
  if (cat === '思考') return 'cat-badge-think';
  return 'cat-badge-life';
}

function initSegmentedControl() {
  const group = document.getElementById('edit-art-category-group');
  if (!group) return;
  const hiddenInput = document.getElementById('edit-art-category');
  group.querySelectorAll('.segment-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      group.querySelectorAll('.segment-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (hiddenInput) hiddenInput.value = pill.getAttribute('data-val');
    });
  });
}

function setSegmentedCategory(val) {
  const group = document.getElementById('edit-art-category-group');
  const hiddenInput = document.getElementById('edit-art-category');
  if (hiddenInput) hiddenInput.value = val;
  if (group) {
    group.querySelectorAll('.segment-pill').forEach(pill => {
      if (pill.getAttribute('data-val') === val) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }
}

// Global State
let articles = [];
let moments = [];
let messages = [];
let siteConfig = {};
let currentCategory = 'all';
let isAuthenticated = false;
let editingArticleId = null;

// Lightweight Markdown to HTML Parser
function parseMarkdown(md) {
  if (!md) return '';
  let html = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Pre-process code blocks with language header and copy button
  const codeBlocks = [];
  html = html.replace(/```([a-zA-Z0-9_]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const cleanLang = (lang || 'code').toUpperCase();
    const cleanCode = escapeHtml(code.trim());
    const rawAttr = encodeURIComponent(code.trim());
    codeBlocks.push(`
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-tag">${cleanLang}</span>
          <button class="code-copy-btn" data-code="${rawAttr}" title="复制代码">
            <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>复制</span>
          </button>
        </div>
        <pre><code class="lang-${lang}">${cleanCode}</code></pre>
      </div>
    `);
    return placeholder;
  });

  // Headers with IDs for Table of Contents
  let headingCount = 0;
  html = html.replace(/^### (.*$)/gim, (m, title) => {
    headingCount++;
    return `<h3 id="sec-h3-${headingCount}">${title}</h3>`;
  });
  html = html.replace(/^## (.*$)/gim, (m, title) => {
    headingCount++;
    return `<h2 id="sec-h2-${headingCount}">${title}</h2>`;
  });
  html = html.replace(/^# (.*$)/gim, (m, title) => {
    headingCount++;
    return `<h2 id="sec-h2-${headingCount}">${title}</h2>`;
  });

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote><p>$1</p></blockquote>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Unordered list items
  html = html.replace(/^\s*[\-\*] (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');
  // Fix nested ul duplicates
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs
  html = html.split(/\n{2,}/).map(para => {
    para = para.trim();
    if (!para) return '';
    if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<pre') || para.startsWith('<blockquote') || para.startsWith('__CODE_BLOCK_')) {
      return para;
    }
    return `<p>${para.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    html = html.replace(`__CODE_BLOCK_${idx}__`, block);
  });

  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// Toast Helper
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}

// Format Relative Time
function formatRelativeTime(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return '刚刚';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
    if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} 天前`;
    return d.toISOString().slice(0, 10);
  } catch (e) {
    return dateStr;
  }
}

// --------------------------------------------------------------------------
// 1. Stale-While-Revalidate Loader
// --------------------------------------------------------------------------
async function initData() {
  // Read local caches for 0ms instant display
  try {
    const cachedConfig = localStorage.getItem('atelier_config');
    if (cachedConfig) applyConfig(JSON.parse(cachedConfig));

    const cachedArts = localStorage.getItem('atelier_articles');
    if (cachedArts) {
      articles = JSON.parse(cachedArts);
      renderArticles();
    }

    const cachedMoms = localStorage.getItem('atelier_moments');
    if (cachedMoms) {
      moments = JSON.parse(cachedMoms);
      renderMoments();
    }

    const cachedMsgs = localStorage.getItem('atelier_messages');
    if (cachedMsgs) {
      messages = JSON.parse(cachedMsgs);
      renderMessages();
    }
  } catch (e) {
    console.warn('Cache read error:', e);
  }

  // Fetch background fresh updates
  fetchArticles();
  fetchMoments();
  fetchMessages();
  fetchConfig();
  fetchStatus();
  checkAuthStatus();
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    siteConfig = data;
    localStorage.setItem('atelier_config', JSON.stringify(data));
    applyConfig(data);
  } catch (e) {}
}

function applyConfig(cfg) {
  if (cfg.siteTitle) {
    const titleEl = document.getElementById('site-title-display');
    if (titleEl) titleEl.textContent = cfg.siteTitle;
    document.title = `${cfg.siteTitle} · 沉思与造物`;
  }
  if (cfg.bio) {
    const bioEl = document.getElementById('site-bio-display');
    if (bioEl) bioEl.innerHTML = cfg.bio;
  }
  if (cfg.stampText) {
    const sealEl = document.getElementById('seal-text-display');
    if (sealEl) sealEl.innerHTML = cfg.stampText.replace(/\n/g, '<br>');
  }
}

async function fetchArticles() {
  try {
    const res = await fetch('/api/articles?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    if (data.articles) {
      articles = data.articles;
      localStorage.setItem('atelier_articles', JSON.stringify(articles));
      renderArticles();
      updateStudioArticlesList();
      updateTimelineStats();
    }
  } catch (e) {}
}

async function fetchMoments() {
  try {
    const res = await fetch('/api/moments?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    if (data.moments) {
      moments = data.moments;
      localStorage.setItem('atelier_moments', JSON.stringify(moments));
      renderMoments();
      updateStudioMomentsList();
      updateTimelineStats();
    }
  } catch (e) {}
}

async function fetchMessages() {
  try {
    const res = await fetch('/api/messages?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    if (data && data.messages) {
      messages = data.messages;
      localStorage.setItem('atelier_messages', JSON.stringify(messages));
      renderMessages();
      updateStudioMessagesList();
      updateTimelineStats();
    }
  } catch (e) {
    console.error('fetchMessages error:', e);
  }
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    if (data.uptime) {
      const upEl = document.getElementById('stat-uptime');
      if (upEl) upEl.textContent = data.uptime;
    }
    if (data.cpu && data.memory) {
      const coreEl = document.getElementById('stat-core');
      if (coreEl) coreEl.textContent = `${data.cpu.cores} vCPUs · ${data.memory.totalGiB}GB RAM`;
    }
  } catch (e) {}
}

// --------------------------------------------------------------------------
// 2. Render Functions
// --------------------------------------------------------------------------
function renderArticles() {
  const container = document.getElementById('essays-list-container');
  const featuredSlot = document.getElementById('featured-essay-slot');
  if (!container || !featuredSlot) return;

  const filtered = currentCategory === 'all' 
    ? articles 
    : articles.filter(a => a.category === currentCategory);

  if (filtered.length === 0) {
    featuredSlot.innerHTML = '';
    container.innerHTML = '<div class="loading-skeleton">该分类下暂无文墨</div>';
    return;
  }

  // First item as Featured Hero Card
  const [featured, ...rest] = filtered;

  featuredSlot.innerHTML = `
    <div class="featured-essay-card" data-id="${featured.id}">
      <div class="featured-badge-row">
        <span class="pill-badge">${featured.category || '随笔'}</span>
        <span class="featured-date mono">${featured.date || ''}</span>
        <span class="featured-date mono">·</span>
        <span class="featured-date mono">${featured.readTime || '3 分钟'}</span>
      </div>
      <h3 class="featured-title">${escapeHtml(featured.title)}</h3>
      <p class="featured-summary">${escapeHtml(featured.summary || '')}</p>
      <div class="read-more-action">
        <span>沉浸阅览</span>
        <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </div>
    </div>
  `;

  featuredSlot.querySelector('.featured-essay-card').addEventListener('click', () => {
    openReader(featured);
  });

  // Rest items as Index Table
  if (rest.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = rest.map(art => `
    <div class="essay-row-item" data-id="${art.id}">
      <div class="essay-row-main">
        <span class="essay-date-col">${art.date || ''}</span>
        <span class="essay-title-col">${escapeHtml(art.title)}</span>
      </div>
      <div class="essay-row-meta">
        <span class="essay-date-col-mobile">${art.date || ''}</span>
        <span class="essay-cat-pill">${art.category || '随笔'}</span>
        <span class="essay-readtime-pill">${art.readTime || ''}</span>
        <svg class="svg-icon essay-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="7" y1="17" x2="17" y2="7"></line>
          <polyline points="7 7 17 7 17 17"></polyline>
        </svg>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.essay-row-item').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-id');
      const item = articles.find(a => a.id === id);
      if (item) openReader(item);
    });
  });
}

function renderMoments() {
  const container = document.getElementById('moments-timeline-container');
  if (!container) return;

  if (moments.length === 0) {
    container.innerHTML = '<div class="loading-skeleton">暂无闪念记录</div>';
    return;
  }

  container.innerHTML = moments.map(m => `
    <div class="moment-entry">
      <div class="moment-dot"></div>
      <div class="moment-header">
        <span class="moment-tag"># ${escapeHtml(m.tag || '随想')}</span>
        <span class="moment-time">${formatRelativeTime(m.time)}</span>
      </div>
      <p class="moment-text">${escapeHtml(m.content)}</p>
    </div>
  `).join('');
}

function renderMessages() {
  const container = document.getElementById('messages-wall');
  if (!container) return;

  if (messages.length === 0) {
    container.innerHTML = '<div class="loading-skeleton">素纸尚白，欢迎写下第一笔。</div>';
    return;
  }

  container.innerHTML = messages.map(msg => `
    <div class="message-card">
      <p class="msg-body">${escapeHtml(msg.content)}</p>
      <div class="msg-meta">
        <span class="msg-author">墨友 · ${escapeHtml(msg.author || '墨友')}</span>
        <span class="msg-time">${formatRelativeTime(msg.time)}</span>
      </div>
      ${msg.echo ? `
        <div class="msg-echo-box">
          <div class="echo-header">
            <span class="echo-tag">
              <svg style="width:12px;height:12px;display:inline-block;vertical-align:-1px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              工坊回笔
            </span>
            <span class="echo-time">${formatRelativeTime(msg.echo.time)}</span>
          </div>
          <p class="echo-body">${escapeHtml(msg.echo.content)}</p>
        </div>
      ` : ''}
    </div>
  `).join('');
}

// Timeline Summary Stats Updater
function updateTimelineStats() {
  const essaysEl = document.getElementById('tstat-essays');
  if (essaysEl) essaysEl.textContent = (articles || []).length;

  const momentsEl = document.getElementById('tstat-moments');
  if (momentsEl) momentsEl.textContent = (moments || []).length;

  const messagesEl = document.getElementById('tstat-messages');
  if (messagesEl) messagesEl.textContent = (messages || []).length;
}

// --------------------------------------------------------------------------
// 3. Reader Drawer Logic
// --------------------------------------------------------------------------
function openReader(article) {
  activeQuoteArticle = article;
  const overlay = document.getElementById('reader-overlay');
  const drawer = document.getElementById('reader-drawer');
  const catEl = document.getElementById('reader-category');
  const dateEl = document.getElementById('reader-date');
  const readEl = document.getElementById('reader-read-time');
  const titleEl = document.getElementById('reader-title');
  const sumEl = document.getElementById('reader-summary');
  const contentEl = document.getElementById('reader-content');
  const scrollContainer = document.getElementById('drawer-scroll-container') || document.querySelector('.drawer-content-scroll');
  const progressBar = document.getElementById('reader-progress-bar');

  catEl.textContent = article.category || '随笔';
  dateEl.textContent = article.date || '';
  
  // Calculate precise Chinese/English word count
  const rawText = (article.content || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  const wordCount = rawText.length;
  const readMin = Math.max(1, Math.ceil(wordCount / 380));
  readEl.textContent = `约 ${wordCount.toLocaleString()} 字 · 需 ${readMin} 分钟`;
  
  titleEl.textContent = article.title;
  sumEl.textContent = article.summary || '';

  // Render markdown or html
  // Build AI Insight Card
  const insights = article.insights || [
    "提炼核心思辨与实践手记，回归克制的人文排版与技术自洽；",
    "以纸境留白对抗数字噪音，在微云之境构筑自治工程流水线；",
    "长效保活与边缘网络协同，为创作者保留纯净的思想自留地。"
  ];
  const density = article.density || "90% · 深度沉淀";
  
  const insightCardHTML = `
    <div class="ai-insight-card">
      <div class="ai-insight-header">
        <div class="ai-insight-badge">
          <svg class="ai-insight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
          </svg>
          <span>核心摘要 · 架构备忘</span>
        </div>
        <div class="ai-insight-meta">
          <span class="ai-chip">架构重点 <strong>${escapeHtml(density)}</strong></span>
          <span class="ai-chip">速读要点</span>
        </div>
      </div>
      <ul class="ai-insight-list">
        ${insights.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>
  `;
  
  contentEl.innerHTML = insightCardHTML + parseMarkdown(article.content);

  // Bind code block copy buttons
  contentEl.querySelectorAll('.code-copy-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const codeText = decodeURIComponent(btn.getAttribute('data-code') || '');
      navigator.clipboard.writeText(codeText).then(() => {
        btn.classList.add('copied');
        btn.querySelector('span').textContent = '已复制 ✦';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.querySelector('span').textContent = '复制';
        }, 2000);
      });
    };
  });

  // Build Dynamic Table of Contents (TOC) - Desktop Sidebar + Mobile Adaptive Accordion
  const headings = contentEl.querySelectorAll('h2, h3');
  contentEl.querySelectorAll('.reader-toc-container').forEach(el => el.remove());

  const desktopTocRail = document.getElementById('reader-desktop-sidebar');
  const mobileTocSlot = document.getElementById('reader-mobile-toc-slot');

  if (headings.length >= 2) {
    const hasH2 = Array.from(headings).some(h => h.tagName.toLowerCase() === 'h2');
    let tocListHtml = '';
    headings.forEach((h, i) => {
      const isSub = hasH2 && h.tagName.toLowerCase() === 'h3';
      const anchorId = h.id || `heading-${i}`;
      h.id = anchorId;
      tocListHtml += `
        <li class="reader-toc-item ${isSub ? 'level-sub' : 'level-top'}" data-target="${anchorId}">
          <span class="toc-bullet">${isSub ? '·' : '§'}</span>
          <span class="toc-text">${escapeHtml(h.textContent)}</span>
        </li>
      `;
    });

    // 1. Desktop Left Rail
    if (desktopTocRail) {
      desktopTocRail.innerHTML = `
        <div class="desktop-sidebar-inner">
          <div class="desktop-toc-header">
            <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:5px;"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line></svg>
            导读脉络
          </div>
          <ul class="desktop-toc-list">
            ${tocListHtml}
          </ul>
        </div>
      `;
      desktopTocRail.querySelectorAll('.reader-toc-item').forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          const targetId = item.getAttribute('data-target');
          const targetEl = document.getElementById(targetId);
          if (targetEl && scrollContainer) {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
        };
      });
    }

    // 2. Mobile Collapsible Accordion (below summary, above content!)
    if (mobileTocSlot) {
      mobileTocSlot.innerHTML = `
        <details class="reader-mobile-toc-details">
          <summary class="reader-mobile-toc-summary">
            <span class="mobile-toc-badge">
              <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px;"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line></svg>
              <span>导读脉络 (${headings.length} 节)</span>
            </span>
            <span class="mobile-toc-arrow">▾</span>
          </summary>
          <ul class="mobile-toc-list">
            ${tocListHtml}
          </ul>
        </details>
      `;
      mobileTocSlot.querySelectorAll('.reader-toc-item').forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          const targetId = item.getAttribute('data-target');
          const targetEl = document.getElementById(targetId);
          const details = mobileTocSlot.querySelector('details');
          if (details) details.removeAttribute('open');
          if (targetEl && scrollContainer) {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
        };
      });
    }
  } else {
    if (desktopTocRail) desktopTocRail.innerHTML = '';
    if (mobileTocSlot) mobileTocSlot.innerHTML = '';
  }

    // Enforce mobile cross-axis stretch & containment
  const articleBodyEl = drawer.querySelector('.drawer-article-body');
  if (articleBodyEl) {
    articleBodyEl.style.width = '100%';
    articleBodyEl.style.maxWidth = '100%';
    articleBodyEl.style.minWidth = '0';
    articleBodyEl.style.boxSizing = 'border-box';
  }
  const layoutWrapEl = drawer.querySelector('.reader-layout-wrap');
  if (layoutWrapEl && window.innerWidth < 960) {
    layoutWrapEl.style.alignItems = 'stretch';
    layoutWrapEl.style.width = '100%';
    layoutWrapEl.style.maxWidth = '100%';
    layoutWrapEl.style.boxSizing = 'border-box';
  }

  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Reset scroll and progress bar
  if (scrollContainer) scrollContainer.scrollTop = 0;
  if (progressBar) progressBar.style.width = '0%';

  // Scroll listener for reading progress
  if (scrollContainer && progressBar) {
    scrollContainer.onscroll = () => {
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const pct = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollContainer.scrollTop / maxScroll) * 100)) : 0;
      progressBar.style.width = pct + '%';
    };
  }

  // Dark Ink Mode toggler
  const themeBtn = document.getElementById('btn-theme-reader');
  if (themeBtn && drawer) {
    themeBtn.onclick = () => {
      const isDark = drawer.classList.toggle('ink-dark-mode');
      showToast(isDark ? '已切换至暮墨夜泊护眼模式' : '已切换至竹尾素纸温润模式');
    };
  }

  // Set up copy link button
  const copyBtn = document.getElementById('btn-copy-article-link');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const url = `${window.location.origin}/#art-${article.id}`;
      navigator.clipboard.writeText(url).then(() => {
        showToast('文章直达链接已复制至剪贴板');
      });
    };
  }

  // Set up postlude buttons
  const postludeCopyBtn = document.getElementById('postlude-copy-btn');
  if (postludeCopyBtn) {
    postludeCopyBtn.onclick = () => {
      const url = `${window.location.origin}/#art-${article.id}`;
      navigator.clipboard.writeText(url).then(() => {
        showToast('纸卷链接已复制，感谢知音分享');
      });
    };
  }

  const postludeCardBtn = document.getElementById('postlude-card-btn');
  if (postludeCardBtn) {
    postludeCardBtn.onclick = () => {
      const excerpt = article.summary || article.title;
      openQuoteModal(article.title, excerpt, article.title);
    };
  }

  const postludeShareX = document.getElementById('postlude-share-x');
  if (postludeShareX) {
    postludeShareX.onclick = () => {
      const slug = article.slug || article.id;
      const url = `https://hlat.top/article/${slug}`;
      const text = `【${article.title}】\n${(article.summary || '').trim()}\n\n来自 Sxtx · 纸境工坊：`;
      const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    };
  }

  const postludeTopBtn = document.getElementById('postlude-top-btn');
  if (postludeTopBtn && scrollContainer) {
    postludeTopBtn.onclick = () => {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
}

function closeReader() {
  const overlay = document.getElementById('reader-overlay');
  overlay.style.display = 'none';
  document.body.style.overflow = '';
}

// Font size adjustments in Reader
let currentReaderFontSize = 1.05;
document.getElementById('btn-font-smaller')?.addEventListener('click', () => {
  if (currentReaderFontSize > 0.85) {
    currentReaderFontSize -= 0.1;
    document.getElementById('reader-content').style.fontSize = `${currentReaderFontSize}rem`;
  }
});
document.getElementById('btn-font-bigger')?.addEventListener('click', () => {
  if (currentReaderFontSize < 1.45) {
    currentReaderFontSize += 0.1;
    document.getElementById('reader-content').style.fontSize = `${currentReaderFontSize}rem`;
  }
});

// --------------------------------------------------------------------------
// 4. Global Search Modal (Spotlight / Raycast Style)
// --------------------------------------------------------------------------
function openSearchModal() {
  const modal = document.getElementById('search-modal');
  const input = document.getElementById('search-query-input');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  input.value = '';
  input.focus();
  runSearch('');
}

function closeSearchModal() {
  const modal = document.getElementById('search-modal');
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function runSearch(query) {
  const list = document.getElementById('search-results-list');
  const q = query.trim().toLowerCase();

  if (!q) {
    list.innerHTML = '<div class="search-hint">输入文章标题、摘要、标签或灵感微语关键字...</div>';
    return;
  }

  const matchedArticles = articles.filter(a => 
    (a.title && a.title.toLowerCase().includes(q)) ||
    (a.summary && a.summary.toLowerCase().includes(q)) ||
    (a.category && a.category.toLowerCase().includes(q))
  );

  const matchedMoments = moments.filter(m => 
    (m.content && m.content.toLowerCase().includes(q)) ||
    (m.tag && m.tag.toLowerCase().includes(q))
  );

  if (matchedArticles.length === 0 && matchedMoments.length === 0) {
    list.innerHTML = '<div class="search-hint">未检索到相关内容</div>';
    return;
  }

  let html = '';
  matchedArticles.forEach(a => {
    html += `
      <div class="search-result-item" data-type="article" data-id="${a.id}">
        <div class="sr-title">${escapeHtml(a.title)}</div>
        <div class="sr-meta">
          <span>文墨 · ${a.category || ''}</span>
          <span>${a.date || ''}</span>
        </div>
      </div>
    `;
  });

  matchedMoments.forEach(m => {
    html += `
      <div class="search-result-item" data-type="moment" data-id="${m.id}">
        <div class="sr-title">${escapeHtml(m.content.slice(0, 60))}...</div>
        <div class="sr-meta">
          <span>微语 · #${m.tag || '随想'}</span>
          <span>${formatRelativeTime(m.time)}</span>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;

  list.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.getAttribute('data-type');
      const id = item.getAttribute('data-id');
      closeSearchModal();
      if (type === 'article') {
        const art = articles.find(a => a.id === id);
        if (art) openReader(art);
      } else {
        const el = document.getElementById('moments');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

// --------------------------------------------------------------------------
// 5. Admin Studio Logic
// --------------------------------------------------------------------------
async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    isAuthenticated = !!data.authenticated;
    updateAdminUI();
  } catch (e) {
    isAuthenticated = false;
  }
}

function updateAdminUI() {
  const dot = document.getElementById('admin-badge-indicator');
  const loginView = document.getElementById('admin-login-view');
  const workView = document.getElementById('admin-work-view');

  if (dot) dot.style.display = isAuthenticated ? 'block' : 'none';

  if (isAuthenticated) {
    if (loginView) loginView.style.display = 'none';
    if (workView) workView.style.display = 'block';
    updateStudioArticlesList();
      updateTimelineStats();
    updateStudioMomentsList();
      updateTimelineStats();
    updateStudioMessagesList();
      updateTimelineStats();
    loadConfigIntoSettingsForm();
  } else {
    if (loginView) loginView.style.display = 'block';
    if (workView) workView.style.display = 'none';
  }
}

function openAdminModal() {
  const modal = document.getElementById('admin-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  updateAdminUI();
}

function closeAdminModal() {
  const modal = document.getElementById('admin-modal');
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

// Admin Login Form
document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwdInput = document.getElementById('admin-pwd-input');
  const errEl = document.getElementById('login-error-msg');
  const pwd = pwdInput.value;
  errEl.textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (data.ok) {
      isAuthenticated = true;
      if (data.token) {
        localStorage.setItem('atelier_admin_token', data.token);
      }
      pwdInput.value = '';
      updateAdminUI();
      showToast('已进入 Sxtx 工坊控制台');
    } else {
      errEl.textContent = data.error || '管理密钥错误';
    }
  } catch (err) {
    errEl.textContent = '网络请求失败，请稍后重试';
  }
});

// Admin Logout
document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  isAuthenticated = false;
  updateAdminUI();
  showToast('已退出管理后台');
});

// Studio Tab Switching
document.querySelectorAll('.studio-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.studio-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const paneId = tab.getAttribute('data-pane');
    const pane = document.getElementById(paneId);
    if (pane) pane.classList.add('active');
  });
});

// Word count tracking in editor
const contentInput = document.getElementById('edit-art-content');
contentInput?.addEventListener('input', () => {
  const count = contentInput.value.length;
  const counter = document.getElementById('editor-word-count');
  if (counter) counter.textContent = `字数: ${count}`;
});

// Save Article (Create or Update)
document.getElementById('form-article-editor')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-art-id').value;
  const title = document.getElementById('edit-art-title').value.trim();
  const category = document.getElementById('edit-art-category').value;
  const readTime = document.getElementById('edit-art-readtime').value.trim();
  const summary = document.getElementById('edit-art-summary').value.trim();
  const content = document.getElementById('edit-art-content').value;

  const payload = { title, category, readTime, summary, content };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/articles/${id}` : '/api/articles';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      showToast(id ? '文墨修改已保存' : '新文墨已发布');
      resetArticleForm();
      fetchArticles();
      // Switch to articles list tab
      document.querySelector('.studio-tab[data-pane="pane-manage-articles"]')?.click();
    } else {
      showToast(data.error || '保存失败');
    }
  } catch (err) {
    showToast('网络请求异常');
  }
});

function resetArticleForm() {
  document.getElementById('edit-art-id').value = '';
  document.getElementById('edit-art-title').value = '';
  setSegmentedCategory('技术');
  document.getElementById('edit-art-readtime').value = '3 分钟';
  document.getElementById('edit-art-summary').value = '';
  document.getElementById('edit-art-content').value = '';
  document.getElementById('editor-word-count').textContent = '字数: 0';
  document.getElementById('btn-save-art-text').textContent = '即刻发布文墨';
}

document.getElementById('btn-reset-art-form')?.addEventListener('click', resetArticleForm);

// Update Studio Article List
function updateStudioArticlesList() {
  const countEl = document.getElementById('studio-art-count');
  if (countEl) countEl.textContent = articles.length;

  const mbArt = document.getElementById('mb-art-count');
  if (mbArt) mbArt.textContent = articles.length;

  const list = document.getElementById('studio-art-list');
  if (!list) return;

  if (articles.length === 0) {
    list.innerHTML = '<div class="loading-skeleton">暂无文墨</div>';
    return;
  }

  list.innerHTML = articles.map(art => {
    const catCls = getCatClass(art.category);
    return `
      <div class="studio-item-row">
        <span class="cat-badge ${catCls}">${escapeHtml(art.category || '随笔')}</span>
        <span class="sir-title-stream" title="${escapeHtml(art.title)}">${escapeHtml(art.title)}</span>
        <div class="sir-time-group">
          <span class="sir-time-rel">${formatRelativeTime(art.date)}</span>
          <span class="sir-time-abs">(${escapeHtml(art.date || '')})</span>
        </div>
        <div class="studio-item-actions" style="display:flex;gap:0.35rem;">
          <button class="action-btn-sm edit-art-btn" data-id="${art.id}">编辑</button>
          <button class="action-btn-sm delete delete-art-btn" data-id="${art.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');

  // Bind edit & delete
  list.querySelectorAll('.edit-art-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const art = articles.find(a => a.id === btn.getAttribute('data-id'));
      if (art) {
        document.getElementById('edit-art-id').value = art.id;
        document.getElementById('edit-art-title').value = art.title;
        setSegmentedCategory(art.category || '技术');
        document.getElementById('edit-art-readtime').value = art.readTime || '3 分钟';
        document.getElementById('edit-art-summary').value = art.summary || '';
        document.getElementById('edit-art-content').value = art.content || '';
        document.getElementById('editor-word-count').textContent = `字数: ${(art.content || '').length}`;
        document.getElementById('btn-save-art-text').textContent = '更新文墨';
        document.querySelector('.studio-tab[data-pane="pane-write-article"]')?.click();
      }
    });
  });

  list.querySelectorAll('.delete-art-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确认删除此篇文墨吗？此操作不可逆。')) return;
      const id = btn.getAttribute('data-id');
      try {
        const res = await fetch(`/api/articles/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) {
          showToast('文墨已删除');
          fetchArticles();
        }
      } catch (e) {
        showToast('删除失败');
      }
    });
  });
}

// Moment Form Submit
document.getElementById('form-moment-editor')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = document.getElementById('edit-mom-content').value.trim();
  const tag = document.getElementById('edit-mom-tag').value.trim();

  try {
    const res = await fetch('/api/moments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, tag })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('灵感微语已发布');
      document.getElementById('edit-mom-content').value = '';
      fetchMoments();
      document.querySelector('.studio-tab[data-pane="pane-manage-moments"]')?.click();
    }
  } catch (err) {
    showToast('发布异常');
  }
});

// Update Studio Moments List
function updateStudioMomentsList() {
  const mbMom = document.getElementById('mb-mom-count');
  if (mbMom) mbMom.textContent = moments.length;
  const list = document.getElementById('studio-mom-list');
  if (!list) return;

  if (moments.length === 0) {
    list.innerHTML = '<div class="loading-skeleton">暂无闪念</div>';
    return;
  }

  list.innerHTML = moments.map(m => `
    <div class="studio-item-row">
      <div class="studio-item-left">
        <span class="sir-title">${escapeHtml(m.content)}</span>
        <span class="sir-meta">#${m.tag} · ${formatRelativeTime(m.time)}</span>
      </div>
      <div class="studio-item-actions">
        <button class="action-btn-sm delete delete-mom-btn" data-id="${m.id}">删除</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.delete-mom-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确认删除此条微语？')) return;
      const id = btn.getAttribute('data-id');
      await fetch(`/api/moments/${id}`, { method: 'DELETE' });
      showToast('微语已删除');
      fetchMoments();
    });
  });
}

// Update Studio Messages List
function updateStudioMessagesList() {
  const mbMsg = document.getElementById('mb-msg-count');
  if (mbMsg) mbMsg.textContent = messages.length;
  const list = document.getElementById('studio-msg-list');
  if (!list) return;

  if (!messages || messages.length === 0) {
    list.innerHTML = '<div class="loading-skeleton" style="padding:1.5rem;text-align:center;color:var(--text-muted);">暂无留言记录</div>';
    return;
  }

  list.innerHTML = messages.map(msg => `
    <div class="studio-item-row" id="studio-msg-row-${escapeHtml(msg.id)}" style="flex-direction:column;align-items:stretch;padding:1rem 1.15rem;margin-bottom:0.85rem;background:var(--bg-card);border:1px solid var(--border-line);border-radius:6px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div class="studio-item-left" style="flex:1;">
          <span class="sir-title" style="font-weight:600;display:block;margin-bottom:0.35rem;font-size:0.95rem;color:var(--text-title);line-height:1.5;">${escapeHtml(msg.content)}</span>
          <span class="sir-meta" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:0.35rem;">
            署名: <strong>${escapeHtml(msg.author || '墨友')}</strong> · ${formatRelativeTime(msg.time)}
          </span>
        </div>
        <div class="studio-item-actions" style="display:flex;gap:0.4rem;align-items:center;flex-shrink:0;">
          <button class="action-btn-sm toggle-reply-btn" data-id="${escapeHtml(msg.id)}" style="background:var(--bg-subtle);border:1px solid var(--border-line);color:var(--text-title);padding:0.25rem 0.65rem;border-radius:4px;cursor:pointer;font-size:0.8rem;">
            ${msg.echo ? '编辑回信' : '回复留墨'}
          </button>
          <button class="action-btn-sm delete delete-msg-btn" data-id="${escapeHtml(msg.id)}" style="background:#fee2e2;border:1px solid #fca5a5;color:#b91c1c;padding:0.25rem 0.65rem;border-radius:4px;cursor:pointer;font-size:0.8rem;" title="从工坊永久删除此条留言">
            删除
          </button>
        </div>
      </div>

      <!-- Current Reply Status -->
      <div id="reply-preview-${escapeHtml(msg.id)}" style="margin-top:0.45rem;">
        ${msg.echo ? `
          <div class="sir-echo-preview" style="padding:0.45rem 0.75rem;background:var(--bg-subtle);border-left:3px solid var(--brand-seal, #b83b3b);font-size:0.84rem;color:var(--text-body);border-radius:2px;line-height:1.5;">
            <strong style="color:var(--brand-seal, #b83b3b);">✦ 工坊回笔：</strong>${escapeHtml(msg.echo.content)}
          </div>
        ` : `
          <div class="sir-echo-preview" style="font-size:0.78rem;color:var(--text-muted);font-style:italic;">（暂无主理人回笔）</div>
        `}
      </div>

      <!-- Inline Reply Form (Hidden by default, toggled on click) -->
      <div id="reply-form-${escapeHtml(msg.id)}" class="inline-reply-box" style="display:none;margin-top:0.65rem;padding-top:0.65rem;border-top:1px dashed var(--border-line);">
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <input type="text" id="reply-input-${escapeHtml(msg.id)}" value="${escapeHtml(msg.echo ? msg.echo.content : '')}" placeholder="以主理人身份写下工坊回笔..." style="flex:1;padding:0.45rem 0.75rem;border:1px solid var(--border-line);border-radius:4px;font-size:0.85rem;background:var(--bg-paper);color:var(--text-title);" maxlength="300" />
          <button class="paper-btn btn-primary submit-reply-btn" data-id="${escapeHtml(msg.id)}" style="padding:0.45rem 0.85rem;font-size:0.82rem;white-space:nowrap;">
            保存回信
          </button>
          <button class="paper-btn cancel-reply-btn" data-id="${escapeHtml(msg.id)}" style="padding:0.45rem 0.65rem;font-size:0.82rem;white-space:nowrap;background:var(--bg-subtle);">
            取消
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // 1. Delete Message Handler
  list.querySelectorAll('.delete-msg-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (!confirm('确定彻底清除此条留言吗？')) return;

      // Optimistic removal: remove immediately from DOM & memory
      messages = messages.filter(m => m.id !== id);
      localStorage.setItem('atelier_messages', JSON.stringify(messages));
      const row = document.getElementById(`studio-msg-row-${id}`);
      if (row) row.remove();
      renderMessages();
      updateTimelineStats();

      try {
        const token = localStorage.getItem('atelier_admin_token') || '';
        const headers = { 'Cache-Control': 'no-cache' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/messages/${id}?t=${Date.now()}`, {
          method: 'DELETE',
          headers: headers
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          showToast('✓ 留言已彻底删除');
        } else {
          showToast(data.error || '✓ 留言已清除');
        }
      } catch (err) {
        showToast('✓ 留言已清除');
      }

      await fetchMessages();
    });
  });

  // 2. Toggle Reply Form Handler
  list.querySelectorAll('.toggle-reply-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const form = document.getElementById(`reply-form-${id}`);
      if (form) {
        const isHidden = form.style.display === 'none';
        form.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          const input = document.getElementById(`reply-input-${id}`);
          if (input) input.focus();
        }
      }
    });
  });

  // 3. Cancel Reply Form Handler
  list.querySelectorAll('.cancel-reply-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const form = document.getElementById(`reply-form-${id}`);
      if (form) form.style.display = 'none';
    });
  });

  // 4. Submit Reply Handler
  list.querySelectorAll('.submit-reply-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const input = document.getElementById(`reply-input-${id}`);
      const replyContent = input ? input.value.trim() : '';

      try {
        const token = localStorage.getItem('atelier_admin_token') || '';
        const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        btn.disabled = true;
        btn.textContent = '保存中...';

        const res = await fetch(`/api/messages/${id}/reply?t=${Date.now()}`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ content: replyContent })
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.ok) {
          // Update memory & localStorage
          const targetMsg = messages.find(m => m.id === id);
          if (targetMsg) {
            if (replyContent) {
              targetMsg.echo = {
                author: '工坊回笔',
                content: replyContent,
                time: new Date().toISOString()
              };
            } else {
              delete targetMsg.echo;
            }
            localStorage.setItem('atelier_messages', JSON.stringify(messages));
          }
          showToast('✓ 工坊回笔已送达读者');
          updateStudioMessagesList();
          renderMessages();
        } else {
          showToast(data.error || '保存失败，请重试');
          btn.disabled = false;
          btn.textContent = '保存回信';
        }
      } catch (err) {
        showToast('网络异常，请重试');
        btn.disabled = false;
        btn.textContent = '保存回信';
      }
    });
  });
}


function loadConfigIntoSettingsForm() {
  const cfg = siteConfig || {};
  const titleInput = document.getElementById('cfg-site-title');
  const bioInput = document.getElementById('cfg-site-bio');
  const stampInput = document.getElementById('cfg-stamp-text');

  if (titleInput) titleInput.value = cfg.siteTitle || '';
  if (bioInput) bioInput.value = cfg.bio || '';
  if (stampInput) stampInput.value = cfg.stampText || '纸境\nATELIER';
}

// Save Config Form
document.getElementById('form-site-config')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const siteTitle = document.getElementById('cfg-site-title').value.trim();
  const bio = document.getElementById('cfg-site-bio').value.trim();
  const stampText = document.getElementById('cfg-stamp-text').value.trim();

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteTitle, bio, stampText })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('工坊资料已更新');
      siteConfig = data.config;
      applyConfig(siteConfig);
    }
  } catch (e) {
    showToast('更新失败');
  }
});

// Change Password Form
document.getElementById('form-change-pwd')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPwd = document.getElementById('cfg-new-pwd').value;
  const msgEl = document.getElementById('pwd-change-msg');
  msgEl.textContent = '';

  try {
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPwd })
    });
    const data = await res.json();
    if (data.ok) {
      msgEl.textContent = '管理口令已成功更新！请妥善保存。';
      document.getElementById('cfg-new-pwd').value = '';
      showToast('管理口令修改成功');
    } else {
      msgEl.textContent = data.error || '修改失败';
    }
  } catch (e) {
    msgEl.textContent = '请求异常';
  }
});

// --------------------------------------------------------------------------
// 6. Guestbook Submission
// --------------------------------------------------------------------------
document.getElementById('guestbook-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const authorInput = document.getElementById('msg-author');
  const contentInput = document.getElementById('msg-content');
  const author = authorInput.value.trim();
  const content = contentInput.value.trim();

  if (!content) return;

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, content })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('留墨已刻录，感谢您的思辨');
      contentInput.value = '';
      fetchMessages();
    }
  } catch (e) {
    showToast('留墨提交失败，请重试');
  }
});

// --------------------------------------------------------------------------
// 7. Event Listeners & Keyboard Shortcuts
// --------------------------------------------------------------------------

// Ludi Video 10 Detail 1: Chinese Composition Event Protection (打中文不误发)
function attachCompositionGuard(inputEl, onEnterCallback) {
  if (!inputEl) return;
  let isComposing = false;
  inputEl.addEventListener('compositionstart', () => { isComposing = true; });
  inputEl.addEventListener('compositionend', () => { isComposing = false; });
  inputEl.addEventListener('keydown', (e) => {
    if (isComposing || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && onEnterCallback) {
      onEnterCallback(e);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initSegmentedControl();
  initData();
  initChronoAtmosphere();

  // =========================================================================
  // 智境 2.0 体验增强：返回顶部微按钮、全站键盘快捷键、留言快捷提交
  // =========================================================================
  
  // 1. 返回顶部微按钮 (Back to top)
  const btnBackToTop = document.getElementById('btn-back-to-top');
  if (btnBackToTop) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 380) {
        btnBackToTop.classList.add('visible');
      } else {
        btnBackToTop.classList.remove('visible');
      }
    }, { passive: true });

    btnBackToTop.onclick = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  // 2. 全站快捷键 (Esc关闭弹窗, / 或 Ctrl+K 全局搜索, Ctrl+Enter留言提交)
  window.addEventListener('keydown', (e) => {
    // Esc: 关闭所有活动弹窗
    if (e.key === 'Escape') {
      const readerOverlay = document.getElementById('reader-overlay');
      if (readerOverlay && readerOverlay.style.display !== 'none') {
        closeReader();
        return;
      }
      const searchModal = document.getElementById('search-modal');
      if (searchModal && searchModal.style.display !== 'none') {
        closeSearchModal();
        return;
      }
      const adminModal = document.getElementById('admin-modal');
      if (adminModal && adminModal.style.display !== 'none') {
        closeAdminModal();
        return;
      }
    }

    // 搜索快捷键 / 或 Ctrl+K (当不在输入框时)
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
    if (!isTyping && (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'k'))) {
      e.preventDefault();
      openSearchModal();
    }

    // Ctrl + Enter 快捷发送留言
    if (e.ctrlKey && e.key === 'Enter') {
      const msgInput = document.getElementById('msg-content');
      if (document.activeElement === msgInput) {
        const form = document.getElementById('guestbook-form');
        if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  });

  updateTimelineStats();

  // Category filter tabs
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.getAttribute('data-cat');
      renderArticles();
    });
  });

  // Reading Progress bar on scroll
  window.addEventListener('scroll', () => {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const progress = total > 0 ? (window.scrollY / total) * 100 : 0;
    const line = document.getElementById('read-progress');
    if (line) line.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  });

  // Search Button & Input
  document.getElementById('btn-search-trigger')?.addEventListener('click', openSearchModal);
  document.getElementById('btn-close-search')?.addEventListener('click', closeSearchModal);
  document.getElementById('search-query-input')?.addEventListener('input', (e) => {
    runSearch(e.target.value);
  });

  // Admin Studio Trigger
  document.getElementById('btn-admin-trigger')?.addEventListener('click', openAdminModal);
  document.getElementById('footer-admin-link')?.addEventListener('click', openAdminModal);
  document.getElementById('btn-close-admin')?.addEventListener('click', closeAdminModal);

  // Close Reader
  document.getElementById('btn-close-reader')?.addEventListener('click', closeReader);

  // Keyboard Shortcuts: '/' to search, 'Esc' to close, 'Ctrl+Shift+A' for admin
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearchModal();
      closeReader();
      closeAdminModal();
    }
    // Search hotkey: '/' when not typing in an input
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      openSearchModal();
    }
    // Spotlight Cmd+K / Ctrl+K
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearchModal();
    }
    // Admin hotkey: Ctrl+Shift+A
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      openAdminModal();
    }
  });

  // Close modals on clicking overlay background
  document.getElementById('search-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'search-modal') closeSearchModal();
  });
  document.getElementById('reader-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'reader-overlay') closeReader();
  });
  document.getElementById('admin-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'admin-modal') closeAdminModal();
  });
});


// --------------------------------------------------------------------------
// Ambient Chrono-Temporal Atmosphere Engine
// --------------------------------------------------------------------------
function initChronoAtmosphere() {
  const pill = document.querySelector('.hero-status-pill');
  if (!pill) return;
  const textEl = pill.querySelector('.pill-text');
  if (!textEl) return;

  const now = new Date();
  const hour = now.getHours();
  
  const hoursMap = [
    { name: "子时", range: [23, 1], mood: "夜静水深 · 纸境墨香" },
    { name: "丑时", range: [1, 3], mood: "万籁俱寂 · 灵感微光" },
    { name: "寅时", range: [3, 5], mood: "残月未落 · 晨曦微露" },
    { name: "卯时", range: [5, 7], mood: "朝阳初升 · 晨光入阁" },
    { name: "辰时", range: [7, 9], mood: "晴明初染 · 始启造物" },
    { name: "巳时", range: [9, 11], mood: "清风徐来 · 笔耕不辍" },
    { name: "午时", range: [11, 13], mood: "日悬中天 · 墨色沉酣" },
    { name: "未时", range: [13, 15], mood: "微云过隙 · 且听书声" },
    { name: "申时", range: [15, 17], mood: "斜阳穿窗 · 静水深流" },
    { name: "酉时", range: [17, 19], mood: "晚霞入室 · 收心归阁" },
    { name: "戌时", range: [19, 21], mood: "华灯初上 · 静默思辨" },
    { name: "亥时", range: [21, 23], mood: "夜色渐深 · 纸暖砚润" }
  ];

  let currentChrono = hoursMap.find(h => {
    if (h.range[0] > h.range[1]) {
      return hour >= h.range[0] || hour < h.range[1];
    }
    return hour >= h.range[0] && hour < h.range[1];
  }) || hoursMap[8];

  const month = now.getMonth() + 1;
  let season = "暮秋迎冬";
  if (month >= 3 && month <= 5) season = "草木蔓发 · 阳春";
  else if (month >= 6 && month <= 8) season = "蝉鸣入夏 · 朱明";
  else if (month >= 9 && month <= 10) season = "秋水澄澈 · 白藏";
  else season = "暮秋迎冬 · 玄英";

  textEl.innerHTML = `<span class="chrono-time-badge">${currentChrono.name}</span> ${season} · ${currentChrono.mood}`;

  pill.title = "点击感应天时气象与工坊心跳";
  pill.onclick = () => {
    showToast(`天时：${season}（${currentChrono.name}）· 双轨边缘高防运行中`);
  };
}

// ==========================================================================
// 纸境工坊极致升华子系统 (Atelier Master Engines)
// ==========================================================================

// 1. 三重纸境心境主题系统 (Tri-Atmosphere Themes)
const THEMES = ['paper', 'dark', 'sepia'];
const THEME_NAMES = {
  paper: '竹尾素纸',
  dark: '深墨夜砚',
  sepia: '古籍茶褐'
};

function initTheme() {
  const saved = localStorage.getItem('sxtx-atelier-theme') || 'paper';
  setTheme(saved, false);

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => cycleTheme());
  }
}

function setTheme(theme, notify = true) {
  if (!THEMES.includes(theme)) theme = 'paper';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sxtx-atelier-theme', theme);

  const metaColor = document.querySelector('meta[name="theme-color"]');
  if (metaColor) {
    if (theme === 'dark') metaColor.content = '#131416';
    else if (theme === 'sepia') metaColor.content = '#f4ede1';
    else metaColor.content = '#fcfbf9';
  }

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    const icon = toggleBtn.querySelector('.svg-theme-icon');
    if (icon) {
      if (theme === 'dark') {
        icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
      } else if (theme === 'sepia') {
        icon.innerHTML = `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>`;
      } else {
        icon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
      }
    }
  }

  if (notify) {
    showToast(`心境切换至 · ${THEME_NAMES[theme]}`);
  }
}

function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'paper';
  const idx = THEMES.indexOf(current);
  const next = THEMES[(idx + 1) % THEMES.length];
  setTheme(next, true);
}

// 2. 墨句摘录浮标与高清卡片引擎
// 2. 墨句摘录浮标与高清卡片引擎
let activeQuoteArticle = null;
let currentSelectedQuote = '';

function openQuoteModal(title, text, sourceTitle) {
  const modal = document.getElementById('quote-modal-overlay');
  const quoteTextEl = document.getElementById('quote-card-text');
  const quoteSourceEl = document.getElementById('quote-card-source');
  const quoteDateEl = document.getElementById('quote-card-date');
  if (!modal || !quoteTextEl) return;

  currentSelectedQuote = text || title || '';
  quoteTextEl.textContent = currentSelectedQuote;

  const displaySource = sourceTitle || title || (activeQuoteArticle ? activeQuoteArticle.title : 'Sxtx · 纸境工坊');
  if (quoteSourceEl) {
    quoteSourceEl.textContent = displaySource;
  }
  if (quoteDateEl) {
    const now = new Date();
    quoteDateEl.textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  modal.setAttribute('aria-hidden', 'false');
  modal.style.display = 'flex';
}
window.openQuoteModal = openQuoteModal;

function initQuoteSystem() {
  const pill = document.getElementById('selection-quote-pill');
  const modal = document.getElementById('quote-modal-overlay');
  const closeBtn = document.getElementById('btn-close-quote-modal');
  const copyBtn = document.getElementById('btn-copy-quote-text');
  const downloadBtn = document.getElementById('btn-download-quote-card');
  const quoteTextEl = document.getElementById('quote-card-text');
  const quoteSourceEl = document.getElementById('quote-card-source');
  const quoteDateEl = document.getElementById('quote-card-date');

  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      if (pill) pill.style.display = 'none';
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 4 || text.length > 280) {
      if (pill) pill.style.display = 'none';
      return;
    }

    currentSelectedQuote = text;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    if (pill) {
      pill.style.display = 'inline-flex';
      pill.style.left = `${rect.left + rect.width / 2}px`;
      pill.style.top = `${rect.top + window.scrollY}px`;
    }
  };

  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('touchend', () => setTimeout(handleSelection, 200));

  if (pill) {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      pill.style.display = 'none';
      if (!currentSelectedQuote) return;

      openQuoteModal(
        activeQuoteArticle ? activeQuoteArticle.title : '沉思墨句',
        currentSelectedQuote,
        activeQuoteArticle ? activeQuoteArticle.title : 'Sxtx · 纸境工坊'
      );
    });
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    };
  }
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      }
    };
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  });

  if (copyBtn) {
    copyBtn.onclick = () => {
      const sourceName = quoteSourceEl ? quoteSourceEl.textContent : 'Sxtx · 纸境工坊';
      const formatted = `「${currentSelectedQuote}」\n—— Sxtx《${sourceName}》\n来源：https://hlat.top`;
      navigator.clipboard.writeText(formatted).then(() => {
        showToast('已复制墨句文辞到剪贴板 ✦');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      });
    };
  }

  if (downloadBtn) {
    downloadBtn.onclick = () => {
      const canvas = document.getElementById('quote-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = 1200;

      // 预先分行测算排版高度
      const maxTextWidth = w - 180;
      const textToWrap = `“${currentSelectedQuote}”`;

      // 动态根据字数选择合适字号与行距
      let fontSize = 34;
      let lineHeight = 54;
      if (textToWrap.length > 180) {
        fontSize = 28;
        lineHeight = 46;
      } else if (textToWrap.length > 300) {
        fontSize = 24;
        lineHeight = 40;
      }

      ctx.font = `italic ${fontSize}px "Lora", "Noto Serif SC", "Songti SC", serif`;
      const lines = [];
      let currentLine = '';
      for (let n = 0; n < textToWrap.length; n++) {
        const testLine = currentLine + textToWrap[n];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxTextWidth && n > 0) {
          lines.push(currentLine);
          currentLine = textToWrap[n];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      // 计算自适应高度
      const topPadding = 200;
      const bottomPadding = 220;
      const textBlockHeight = lines.length * lineHeight;
      const h = Math.max(760, topPadding + textBlockHeight + bottomPadding);
      canvas.width = w;
      canvas.height = h;

      // 宣纸竹韵背景
      ctx.fillStyle = '#fcfbf9';
      ctx.fillRect(0, 0, w, h);

      // 宣纸双重边框
      ctx.strokeStyle = '#e1ddd4';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, w - 80, h - 80);

      ctx.strokeStyle = '#eae6df';
      ctx.lineWidth = 1;
      ctx.strokeRect(48, 48, w - 96, h - 96);

      // 顶部品牌抬头
      ctx.fillStyle = '#71717a';
      ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('SXTX · 纸境工坊 · 沉思摘录', 80, 100);

      // 顶部日期
      const now = new Date();
      const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
      ctx.textAlign = 'right';
      ctx.font = '500 22px "JetBrains Mono", monospace';
      ctx.fillText(dateStr, w - 80, 100);

      // 顶部虚线
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.moveTo(80, 125);
      ctx.lineTo(w - 80, 125);
      ctx.strokeStyle = '#e1ddd4';
      ctx.stroke();
      ctx.setLineDash([]);

      // 正文内容
      ctx.textAlign = 'left';
      ctx.fillStyle = '#18181b';
      ctx.font = `italic ${fontSize}px "Lora", "Noto Serif SC", "Songti SC", serif`;
      let y = topPadding;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 80, y);
        y += lineHeight;
      }

      // 底部虚线
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.moveTo(80, h - 160);
      ctx.lineTo(w - 80, h - 160);
      ctx.strokeStyle = '#e1ddd4';
      ctx.stroke();
      ctx.setLineDash([]);

      // 底部出处与元数据
      const sourceTitle = (quoteSourceEl ? quoteSourceEl.textContent : '') || (activeQuoteArticle ? activeQuoteArticle.title : '随笔沉思');
      ctx.fillStyle = '#18181b';
      ctx.font = '600 24px "Plus Jakarta Sans", "Noto Serif SC", sans-serif';
      ctx.fillText(`出处：《${sourceTitle}》`, 80, h - 110);

      ctx.fillStyle = '#71717a';
      ctx.font = '500 20px "JetBrains Mono", monospace';
      ctx.fillText('hlat.top · 人机共生思想自留地', 80, h - 80);

      // 朱砂印章（纸境工坊）
      const sealX = w - 170, sealY = h - 145, sealW = 90, sealH = 90;
      ctx.save();
      ctx.translate(sealX + sealW / 2, sealY + sealH / 2);
      ctx.rotate(-0.05);
      ctx.strokeStyle = '#b91c1c';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(-sealW / 2, -sealH / 2, sealW, sealH);
      ctx.fillStyle = 'rgba(185, 28, 28, 0.05)';
      ctx.fillRect(-sealW / 2, -sealH / 2, sealW, sealH);
      ctx.fillStyle = '#b91c1c';
      ctx.textAlign = 'center';
      ctx.font = '700 22px "Lora", serif';
      ctx.fillText('纸境', 0, -6);
      ctx.fillText('工坊', 0, 24);
      ctx.restore();

      const link = document.createElement('a');
      link.download = `sxtx-quote-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('高清墨卡已生成并下载 ✦');
    };
  }
}

// 3. 留言板防刷与实时字数统计
function initGuestbookEnhancements() {
  const contentInput = document.getElementById('msg-content');
  const counterEl = document.getElementById('guestbook-counter');
  const hpInput = document.getElementById('input-honeypot');

  if (contentInput && counterEl) {
    contentInput.addEventListener('input', () => {
      const len = contentInput.value.length;
      counterEl.textContent = `${len} / 200 字`;
      counterEl.style.color = len > 190 ? '#b91c1c' : 'var(--text-muted)';
    });
  }

  const form = document.getElementById('guestbook-form');
  if (form && hpInput) {
    form.addEventListener('submit', (e) => {
      if (hpInput.value.trim() !== '') {
        e.preventDefault();
        e.stopImmediatePropagation();
        console.warn('Spambot intercepted.');
        return false;
      }
    }, true);
  }
}

// 4. 全局键盘导航增强与初始化

// Ludi Video 10 Detail 1: Chinese Composition Event Protection (打中文不误发)
function attachCompositionGuard(inputEl, onEnterCallback) {
  if (!inputEl) return;
  let isComposing = false;
  inputEl.addEventListener('compositionstart', () => { isComposing = true; });
  inputEl.addEventListener('compositionend', () => { isComposing = false; });
  inputEl.addEventListener('keydown', (e) => {
    if (isComposing || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && onEnterCallback) {
      onEnterCallback(e);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initSegmentedControl();
  initTheme();
  initQuoteSystem();
  initGuestbookEnhancements();

  window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea') return;

    if (e.key === 't' || e.key === 'T') {
      cycleTheme();
    } else if (e.key === 'j' || e.key === 'J') {
      const reader = document.getElementById('reader-overlay');
      const scrollEl = (reader && reader.style.display !== 'none') ? document.getElementById('drawer-scroll-container') : window;
      scrollEl.scrollBy({ top: 320, behavior: 'smooth' });
    } else if (e.key === 'k' || e.key === 'K') {
      const reader = document.getElementById('reader-overlay');
      const scrollEl = (reader && reader.style.display !== 'none') ? document.getElementById('drawer-scroll-container') : window;
      scrollEl.scrollBy({ top: -320, behavior: 'smooth' });
    }
  });

  if ('serviceWorker' in navigator) {
    
  // Discreet Admin Studio Triggers
  document.getElementById('footer-admin-trigger')?.addEventListener('click', openAdminModal);

  // Keyboard shortcut: Alt + A or Ctrl + Shift + A to open admin
  document.addEventListener('keydown', (e) => {
    if ((e.altKey && (e.key === 'a' || e.key === 'A')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A'))) {
      e.preventDefault();
      openAdminModal();
    }
  });

  // URL Hash check: #admin
  if (window.location.hash === '#admin') {
    setTimeout(openAdminModal, 300);
  }
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#admin') openAdminModal();
  });

  navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('Sxtx Atelier PWA Active:', reg.scope);
    }).catch(() => {});
  }
});
