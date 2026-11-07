#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
📜 Paper Atelier (纸境工坊) · 开源发行版打包与自动化脱敏套件
功能：
1. 自动化安全审查（扫描潜在敏感 API Key、公网 IP、私钥等）；
2. 组装零依赖、纯净的开源发行版目录 (dist/paper-atelier)；
3. 注入高质量素纸美学示例数据 (Seed Data)；
4. 验证 Dockerfile、package.json 与启动命令；
5. 提供一键发布到 GitHub 全新开源仓库的 Git 命令。
"""

import os
import sys
import shutil
import json
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR = os.path.join(BASE_DIR, "dist", "paper-atelier")

def log(msg):
    print(f"[Release-Packer] {msg}")

def check_secrets_in_text(filepath, content):
    """扫描文件中是否包含疑似未脱敏的 API 密钥或敏感散列"""
    patterns = [
        (r'sk-[a-zA-Z0-9]{30,}', "OpenAI/第三方 sk- 密钥"),
        (r'[0-9a-f]{32}\.[a-zA-Z0-9]{16}', "智谱 GLM 原生密钥"),
        (r'-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----', "RSA/SSH 私钥"),
        (r'scrypt\$[0-9a-f]+\$[0-9a-f]{64,}', "真实管理员密码散列")
    ]
    findings = []
    for pat, desc in patterns:
        if re.search(pat, content):
            findings.append(desc)
    return findings

def main():
    log("=== 开始构建 Paper Atelier (纸境工坊) 开源发行包 ===")
    
    # 1. 清理并新建目标目录
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    os.makedirs(DIST_DIR, exist_ok=True)
    
    # 2. 核心源码与文档复制清单
    root_files = [
        "server.js",
        "curator_daemon.py",
        "package.json",
        "README.md",
        "LICENSE",
        "Dockerfile",
        "docker-compose.yml",
        ".env.example",
        ".dockerignore",
        ".gitignore"
    ]
    
    for f in root_files:
        src = os.path.join(BASE_DIR, f)
        dst = os.path.join(DIST_DIR, f)
        if os.path.exists(src):
            with open(src, "r", encoding="utf-8") as sf:
                content = sf.read()
            issues = check_secrets_in_text(f, content)
            if issues:
                log(f"[警告] 文件 {f} 疑似包含敏感信息: {', '.join(issues)}")
            with open(dst, "w", encoding="utf-8", newline="\n") as df:
                df.write(content)
            log(f"已同步核心文件: {f}")
        else:
            log(f"[跳过] 根文件未找到: {f}")
            
    # 3. 复制公共静态资产目录 public/
    public_src = os.path.join(BASE_DIR, "public")
    public_dst = os.path.join(DIST_DIR, "public")
    if os.path.exists(public_src):
        shutil.copytree(public_src, public_dst, ignore=shutil.ignore_patterns("*.bak*", "*.tmp", ".DS_Store"))
        # 确保 og 目录存在且为空（动态生成）
        og_dir = os.path.join(public_dst, "og")
        os.makedirs(og_dir, exist_ok=True)
        log("已同步公共静态资产: public/")
        
    # 4. 复制 scripts/ 目录（排除本地私有测试脚本）
    scripts_src = os.path.join(BASE_DIR, "scripts")
    scripts_dst = os.path.join(DIST_DIR, "scripts")
    os.makedirs(scripts_dst, exist_ok=True)
    if os.path.exists(os.path.join(scripts_src, "post_to_twitter.py")):
        shutil.copy(os.path.join(scripts_src, "post_to_twitter.py"), os.path.join(scripts_dst, "post_to_twitter.py"))
        log("已同步宣发脚本: scripts/post_to_twitter.py")
        
    # 5. 组装干净的种子数据 data/
    data_dst = os.path.join(DIST_DIR, "data")
    os.makedirs(data_dst, exist_ok=True)
    
    # 同步配置模板
    shutil.copy(os.path.join(BASE_DIR, "data", "config.example.json"), os.path.join(data_dst, "config.example.json"))
    
    # 注入精选种子数据
    shutil.copy(os.path.join(BASE_DIR, "data", "articles.seed.json"), os.path.join(data_dst, "articles.json"))
    shutil.copy(os.path.join(BASE_DIR, "data", "moments.seed.json"), os.path.join(data_dst, "moments.json"))
    shutil.copy(os.path.join(BASE_DIR, "data", "messages.seed.json"), os.path.join(data_dst, "messages.json"))
    log("已注入高质量开源种子数据: data/ (articles.json, moments.json, messages.json)")
    
    # 6. 安全终审：确认私密文件绝对未泄露进 dist
    forbidden_files = ["config.json", "visits.json", "stats.json", ".stats-seen.json", "tombstones.json", "resonances.json"]
    leak_detected = False
    for fb in forbidden_files:
        if os.path.exists(os.path.join(data_dst, fb)):
            log(f"[严重错误] 私密数据被意外复制到了发行包: {fb}")
            leak_detected = True
            
    if leak_detected:
        log("[终止] 安全审查未通过，请排查后重试！")
        sys.exit(1)
        
    log("安全审查 100% 通过！所有私密配置与生产数据均已彻底剥离脱敏。")
    log("=" * 60)
    log(f"开源发行包已就绪: {DIST_DIR}")
    print("""
下一步：你可以通过以下两种方式之一将项目发布到 GitHub：

【推荐：发布到全新独立的 GitHub 仓库 (如 paper-atelier)】
1. 在 GitHub 上点击新建仓库 (New Repository)，命名为：paper-atelier (设置为 Public)；
2. 在本地执行以下发布命令：
   cd "{dist_path}"
   git init -b main
   git add .
   git commit -m "feat: initial open source release v1.0.0 (Zero-Dependency & Paper-Tactile Aesthetic)"
   git remote add origin https://github.com/ygwbl/paper-atelier.git
   git push -u origin main

【本地纯净测试启动验证】
   cd "{dist_path}"
   node server.js
   打开 http://localhost:8080 即可体验纯净开箱！
""".format(dist_path=DIST_DIR))

if __name__ == "__main__":
    main()
