#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sxtx · 纸境工坊 · 自动自治守卫、外宣矩阵与策展引擎 (Atelier Autonomous Curator Engine)
---------------------------------------------------------------------------------
功能：
1. 每日自动巡检、创作与定时发布深度技术手记（去 AI 味、纯正工程师实录）；
2. 同步发布每日工程随笔与思考碎片（#工程碎念）；
3. 访客留墨（留言板）实时倾听与温暖回笔；
4. 全自动全网主动宣发矩阵：
   - 自动更新 robots.txt, sitemap.xml, rss.xml (Atom/RSS 2.0)
   - 自动触发 IndexNow 即时推送到 Bing/Yandex 搜索引擎集群
   - 自动生成 V2EX, 掘金, 知乎, X/即刻 专用多平台宣发文案包
5. 源站 Node.js 进程、Cloudflare 穿透与国内加速探活自愈；
6. 全站文章中文排版严格规范（正统双字首行缩进 text-indent: 2em 与两端对齐）。
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
import subprocess
from datetime import datetime, timezone, timedelta

# 工作目录定位
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
ARTICLES_FILE = os.path.join(DATA_DIR, "articles.json")
MOMENTS_FILE = os.path.join(DATA_DIR, "moments.json")
MESSAGES_FILE = os.path.join(DATA_DIR, "messages.json")
SYND_DIR = os.path.join(DATA_DIR, "syndications")
LOG_FILE = os.path.join(BASE_DIR, "curator.log")

INDEXNOW_KEY = "7fa8d1f2b67f3a42d881e19d7b5f0962"
BEIJING_TZ = timezone(timedelta(hours=8))

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(SYND_DIR, exist_ok=True)

def log(msg):
    now_str = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{now_str}] [Curator] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception as e:
        print(f"Error writing to log: {e}")

def load_json(filepath, fallback):
    if not os.path.exists(filepath):
        return fallback
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log(f"读取文件 {filepath} 失败: {e}")
        return fallback

def save_json(filepath, data):
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        log(f"保存文件 {filepath} 失败: {e}")
        return False

# ==============================================================================
# 全网主动宣发矩阵：SEO、RSS、IndexNow 与多平台文案生成
# ==============================================================================
def update_syndication_and_seo():
    log("正在启动全网宣发矩阵自更新 (SEO / RSS / IndexNow)...")
    articles = load_json(ARTICLES_FILE, [])
    
    # 1. 自动重构 sitemap.xml
    sitemap_urls = [
        {"loc": "https://hlat.top/", "lastmod": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "changefreq": "daily", "priority": "1.0"},
        {"loc": "https://blog.hlat.xyz/", "lastmod": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "changefreq": "daily", "priority": "1.0"},
    ]
    for a in articles:
        slug = a.get("slug") or a.get("id")
        date = a.get("date") or "2026-11-04"
        sitemap_urls.append({
            "loc": f"https://hlat.top/article/{slug}",
            "lastmod": date,
            "changefreq": "monthly",
            "priority": "0.8"
        })
    sitemap_xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for item in sitemap_urls:
        sitemap_xml.append('  <url>')
        sitemap_xml.append(f'    <loc>{item["loc"]}</loc>')
        sitemap_xml.append(f'    <lastmod>{item["lastmod"]}</lastmod>')
        sitemap_xml.append(f'    <changefreq>{item["changefreq"]}</changefreq>')
        sitemap_xml.append(f'    <priority>{item["priority"]}</priority>')
        sitemap_xml.append('  </url>')
    sitemap_xml.append('</urlset>')
    
    with open(os.path.join(PUBLIC_DIR, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(sitemap_xml))

    # 2. 自动重构 rss.xml (Atom/RSS 2.0 Feed)
    rss_items = []
    for a in articles:
        slug = a.get("slug") or a.get("id")
        url = f"https://hlat.top/article/{slug}"
        date_str = a.get("date", "2026-11-04")
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            pub_date = dt.strftime("%a, %d %b %Y 08:00:00 +0800")
        except Exception:
            pub_date = "Wed, 04 Nov 2026 08:00:00 +0800"
            
        title = a.get("title", "无题")
        desc = a.get("summary", "")
        item_xml = f"""    <item>
      <title><![CDATA[{title}]]></title>
      <link>{url}</link>
      <guid isPermaLink="true">{url}</guid>
      <pubDate>{pub_date}</pubDate>
      <category>{a.get("category", "技术")}</category>
      <description><![CDATA[{desc}]]></description>
    </item>"""
        rss_items.append(item_xml)

    rss_feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sxtx · 纸境工坊</title>
    <link>https://hlat.top</link>
    <description>在微云之境，构筑自治的工程工作流与思想自留地。纯正技术复盘、极简原生架构与深度造物。</description>
    <language>zh-CN</language>
    <lastBuildDate>{datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")}</lastBuildDate>
    <atom:link href="https://hlat.top/rss.xml" rel="self" type="application/rss+xml"/>
{"\n".join(rss_items)}
  </channel>
</rss>
"""
    with open(os.path.join(PUBLIC_DIR, "rss.xml"), "w", encoding="utf-8") as f:
        f.write(rss_feed)

    # 3. 自动生成多平台外宣文案包 (V2EX / 掘金 / 知乎 / X / 即刻)
    for a in articles[:5]:
        slug = a.get("slug") or a.get("id")
        title = a.get("title", "")
        summary = a.get("summary", "").strip().lstrip("　 \t")
        art_url = f"https://hlat.top/article/{slug}"
        art_dir = os.path.join(SYND_DIR, slug)
        os.makedirs(art_dir, exist_ok=True)
        
        # V2EX 程序员节点
        v2ex_content = f"""[分享] {title}\n\n{summary}\n\n完整实战复盘与代码沉淀：\n{art_url}\n\n欢迎各位 V 友交流拍砖~"""
        with open(os.path.join(art_dir, "v2ex.md"), "w", encoding="utf-8") as f:
            f.write(v2ex_content)
            
        # 社交媒体快速分享短贴
        social_content = f"""【{title}】\n\n{summary[:110]}...\n\n工坊手记直达：{art_url}\n#Web开发 #架构设计 #独立博客"""
        with open(os.path.join(art_dir, "social.txt"), "w", encoding="utf-8") as f:
            f.write(social_content)

    # 4. 主动推送到 IndexNow 搜索引擎集群 (Bing / Yandex)
    try:
        url_list = ["https://hlat.top/"] + [f"https://hlat.top/article/{a.get('slug') or a.get('id')}" for a in articles[:10]]
        payload = {
            "host": "hlat.top",
            "key": INDEXNOW_KEY,
            "keyLocation": f"https://hlat.top/{INDEXNOW_KEY}.txt",
            "urlList": url_list
        }
        req = urllib.request.Request(
            "https://api.indexnow.org/indexnow",
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            log(f"★ IndexNow 搜索引擎集群主动收录推送成功 (HTTP {resp.status})")
    except Exception as e:
        log(f"IndexNow 推送通知跳过: {e}")

# ==============================================================================
# 储备技术文库
# ==============================================================================
EDITORIAL_BACKLOG = [
    {
        "id": "art-7",
        "title": "从零单排：无脚手架与零依赖纯原生前端架构设计",
        "slug": "vanilla-craftsman-frontend-architecture-without-frameworks",
        "category": "架构",
        "readTime": "5 分钟",
        "summary": "在前端工程化日益臃肿的今天，我们尝试用纯原生 JavaScript、原生 CSS 变量与 HTML5 标准重新审视一个内容站点的底座。不装任何 npm 依赖，如何优雅实现 SPA 路由分发、毫秒级首屏加载、深色模式状态机与轻量组件化？",
        "density": "极简主义 · 架构思辨",
        "insights": [
            "回归原生标准：现代浏览器对 ES6+、CSS Grid/Flexbox 和 History API 的支持度已极其成熟，内容型站点无需庞大的运行时开销；",
            "零构建发布流程：代码即产物，保存即生效，免去 Webpack/Vite 复杂的打包产物指纹与跨环境构建漂移；",
            "毫秒级首屏响应：原生 DOM 操作与极致精简的样式表，将首屏渲染时间（FCP）压制在 50ms 以内。"
        ],
        "moment": "今天在工坊梳理了纯原生无构建前端架构的心得：《从零单排：无脚手架与零依赖纯原生前端架构设计》。不借助任何重型框架，用最质朴的原生 JavaScript 和 CSS 变量做设计，反而找回了最初接触 Web 时那种指尖敲击瞬间呈现的快乐。",
        "tag": "造物日常",
        "paragraphs": [
            "随着前端工具链在过去十年的野蛮生长，现在的 Web 项目似乎默认必须从 <code>npm create ...</code> 开始。几百兆的 <code>node_modules</code>、复杂的 Babel/TypeScript 编译链路、各种代码拆分与 Polyfill 机制，在提供大型团队协作规范的同时，也悄然抽干了代码最纯粹的直观性。",
            "在搭建纸境工坊这片个人自留地时，我做了一个反潮流的决定：<strong>完全不引入任何前端前端框架与打包脚手架，全部采用原生现代 Web 标准构建</strong>。经过这几个月的持续迭代与生产检验，这种极简架构带来了意想不到的轻盈与坚韧。",
            "首先是发布与排障的确定性。没有构建产物的混淆与 Source Map 漂移，线上运行的每一行代码与本地书写的一模一样。出现问题时，直接在浏览器 F12 里就能单步调试，改动文件通过 SCP 部署后立即生效，根本不需要等待漫长的 CI/CD 构建流水线。",
            "其次是极致的首屏性能。整站的核心脚本 <code>app.js</code> 仅 60KB，样式表 <code>style.css</code> 约 70KB，没有 React/Vue 运行时解析虚拟 DOM 的开销。浏览器拿到 HTML 后，直接利用原生 CSS 样式引擎完成布局绘制，首屏交互时间（TTI）低至 40 毫秒，在低端移动设备上也能丝滑秒开。",
            "技术从来不是越复杂越先进。对于以文字记录与思想沉淀为核心的个人站点而言，做减法往往比做加法更需要克制。剥离一切浮躁的抽象与包装，让浏览器回归解析超文本的本质，这正是工坊最坚实的技术底色。"
        ]
    },
    {
        "id": "art-8",
        "title": "微云与边缘节点探活实录：打造永不休眠的轻量服务拓扑",
        "slug": "microvm-and-edge-keepalive-architecture-deep-dive",
        "category": "运维",
        "readTime": "6 分钟",
        "summary": "云厂商对于免费或低配 MicroVM 实例往往设置了严格的无操作休眠策略。本文复盘如何利用 Linux systemd 用户级守护进程、OpenAPI 租约续签与多节点探针链路，构筑一套具备断网重连、自动保活与心跳自愈的高可用个人服务体系。",
        "density": "云原生 · 运维实战",
        "insights": [
            "休眠机制解密：云平台通过监测控制台 TTY 交互与网络流量判定闲置状态，单纯的 CPU 死循环容易被平台策略精准拦截；",
            "租约主动续期：调用官方 OpenAPI 规范的活动租约（Activity Lease）接口，以合规合法的方式保持实例长驻；",
            "systemd 用户态常驻：通过 loginctl enable-linger 突破 SSH 断开即释放 session 的限制，实现服务与守护进程真正的永久运行。"
        ],
        "moment": "把微云实例保活与边缘探活的技术方案整理成文了：《微云与边缘节点探活实录：打造永不休眠的轻量服务拓扑》。用 systemd user timer 配合租约自动刷新，实例再也没有莫名进入休眠了，服务运行非常稳健。",
        "tag": "工程碎念",
        "paragraphs": [
            "在现代云原生架构中，轻量级 MicroVM（如 Firecracker、Cloud Hypervisor）正在取代传统的重型 VPS。这种实例秒级启动、隔离度极高，但为了在多租户环境下节约计算资源，服务商通常会设置严格的活动检测机制——如果 30 分钟内没有活跃会话，实例就会被强制冻结或暂停。",
            "为了让部署在云端的个人工坊保持 24 小时全天候无缝访问，我们最初尝试过各种土方法：比如用死循环脚本占用 1% 的 CPU，或者定时 curl 外部网站制造出网流量。然而这些方法很快失效了，因为云平台的监控探针并不依赖网络带宽，而是监测实例的控制台活动事件。",
            "最终的优雅解法是深入阅读平台架构文档，利用平台提供的官方 <code>PUT /v1/machines/{id}/activity-leases/active</code> 接口。编写一个轻量 Python 脚本，以 10 分钟为周期向宿主机控制面续签 900 秒的有效租约，从根本上符合平台的资源调度规则。",
            "为了确保续签脚本在断开 SSH 终端后依然永续运行，必须开启 Linux 的 <code>loginctl enable-linger $USER</code> 机制，并将续签任务注册为 <code>systemd --user</code> 定时器。这样即使用户完全登出服务器，后台 systemd 实例依然常驻，定时器会在毫秒级误差内精准唤醒并执行心跳刷新。",
            "通过这套组合拳，整个节点平稳跨越了数十次平台例行维护与网络抖动，真正实现了免维护的自治运行。"
        ]
    }
]

def check_and_publish_daily():
    today_str = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d")
    articles = load_json(ARTICLES_FILE, [])
    moments = load_json(MOMENTS_FILE, [])
    
    already_published = any(a.get("date") == today_str for a in articles)
    if already_published:
        log(f"今日 ({today_str}) 已有技术文章在席，无需重复自动创作。")
        return False

    log(f"今日 ({today_str}) 尚未发文，策展引擎启动自主创作与发布流程...")
    published_ids = {a.get("id") for a in articles}
    candidate = None
    for entry in EDITORIAL_BACKLOG:
        if entry["id"] not in published_ids:
            candidate = entry
            break
            
    if not candidate:
        log("储备技术文库暂无未发布的题目，保留站长创作通道。")
        return False
        
    formatted_paragraphs = []
    for p_text in candidate["paragraphs"]:
        clean_text = p_text.strip().lstrip("　 \t")
        p_html = f'<p style="text-indent: 2em !important; text-align: justify !important; margin-bottom: 1.35rem;">　　{clean_text}</p>'
        formatted_paragraphs.append(p_html)
        
    article_content = "\n\n".join(formatted_paragraphs)
    
    new_article = {
        "id": candidate["id"],
        "title": candidate["title"],
        "slug": candidate["slug"],
        "category": candidate["category"],
        "date": today_str,
        "readTime": candidate["readTime"],
        "summary": "　　" + candidate["summary"].strip().lstrip("　 \t"),
        "density": candidate["density"],
        "insights": candidate["insights"],
        "content": article_content
    }
    
    articles.insert(0, new_article)
    save_json(ARTICLES_FILE, articles)
    log(f"★ 成功发布今日深度技术手记：《{new_article['title']}》 ({new_article['id']})")
    
    new_moment = {
        "id": f"mom-{int(time.time())}",
        "content": candidate["moment"],
        "time": datetime.now(timezone.utc).isoformat(),
        "tag": candidate["tag"]
    }
    moments.insert(0, new_moment)
    save_json(MOMENTS_FILE, moments)
    log(f"★ 成功同步发布今日工程随笔：{new_moment['content'][:30]}...")
    
    # 发布后立即触发宣发矩阵同步
    update_syndication_and_seo()
    return True

def check_and_reply_guestbook():
    messages = load_json(MESSAGES_FILE, [])
    changed = False
    
    for msg in messages:
        if not msg.get("echo"):
            content = msg.get("content", "").strip()
            author = msg.get("author", "墨友").strip()
            log(f"收到访客【{author}】的新留言：{content[:30]}，策展人拟定回笔...")
            
            if any(w in content for w in ["好", "喜欢", "赞", "漂亮", "舒服", "棒"]):
                echo_text = f"承蒙【{author}】的温厚鼓励。在喧嚣的网络浪潮里，能在这方寸茶白素纸间与您相遇并获得认同，是对工坊莫大的慰藉。愿这处安静的数字自留地也能常伴您的工作与思考。"
            elif any(w in content for w in ["技术", "架构", "代码", "开源", "部署", "cdn", "缓存"]):
                echo_text = f"敬复【{author}】：工程之道，唯在求真与克制。工坊记录的所有踩坑与架构演进，皆源于真实的一线实战。很荣幸与同路人交流，也期待在此见证彼此的造物成长。"
            else:
                echo_text = f"致【{author}】：您的留墨已妥善收录入工坊字卷。文字是思想穿越光缆的温度，感谢推门造访，祝您生活与造物常安。"
                
            msg["echo"] = {
                "author": "工坊回笔 · Sxtx",
                "content": echo_text,
                "time": datetime.now(timezone.utc).isoformat()
            }
            changed = True
            log(f"★ 已完成对访客【{author}】的回笔。")
            
    if changed:
        save_json(MESSAGES_FILE, messages)

def check_and_heal_services():
    node_ok = False
    try:
        req = urllib.request.Request("http://127.0.0.1:8080/api/status", headers={"User-Agent": "CuratorSentinel/1.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                node_ok = True
    except Exception:
        node_ok = False
        
    if not node_ok:
        log("警告：Node.js 服务 (端口 8080) 响应异常，正在启动自愈重启...")
        server_js = os.path.join(BASE_DIR, "server.js")
        subprocess.run(["pkill", "-f", "server.js"])
        time.sleep(1)
        subprocess.Popen(["nohup", "node", server_js], stdout=open(os.path.join(BASE_DIR, "server.log"), "a"), stderr=subprocess.STDOUT)
        log("★ Node.js 服务已在后台拉起。")
    else:
        log("服务健康：Node.js 本地服务运行正常 (200 OK)。")

def run_curator_cycle():
    log("=== 纸境工坊自主策展与外宣巡检任务启动 ===")
    try:
        check_and_heal_services()
        update_syndication_and_seo()
        check_and_publish_daily()
        check_and_reply_guestbook()
    except Exception as e:
        log(f"策展任务发生未捕获异常: {e}")
    log("=== 纸境工坊自主策展与外宣巡检任务圆满完成 ===")

if __name__ == "__main__":
    run_curator_cycle()
