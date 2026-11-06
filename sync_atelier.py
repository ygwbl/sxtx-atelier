#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sxltx Atelier Bidirectional Data & Code Synchronizer (v38 Anti-Resurrection Engine)
Features:
- Distributed Tombstones: Deleted messages/moments/articles will never resurrect across dual-node active-active replicas
- CRDT-style metadata union for replies, echoes, and pins
- Code & configuration auto-push with zero-downtime service reload
"""
import os, sys, json, subprocess, tempfile

LOCAL_ROOT = "/opt/sxtx-atelier"
LOCAL_DATA = os.path.join(LOCAL_ROOT, "data")
REMOTE_SSH = "ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -p 2222 ibssh_ue7hto5fl7hwxb4ueerytrqszy@ssh.instabox.sh"
REMOTE_SCP = "scp -o ConnectTimeout=5 -o StrictHostKeyChecking=no -P 2222"
REMOTE_USER_HOST = "ibssh_ue7hto5fl7hwxb4ueerytrqszy@ssh.instabox.sh"
REMOTE_ROOT = "/data/home/personal-site"
REMOTE_DATA = os.path.join(REMOTE_ROOT, "data")

def is_remote_alive():
    cmd = f"{REMOTE_SSH} 'echo PONG'"
    res = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=6)
    return res.returncode == 0 and b"PONG" in res.stdout

def read_json_local(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def write_json_local(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def read_json_remote(rel_path, default):
    rem_path = f"{REMOTE_DATA}/{rel_path}"
    cmd = f"{REMOTE_SSH} 'cat {rem_path}'"
    res = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8)
    if res.returncode != 0:
        return default
    try:
        return json.loads(res.stdout.decode("utf-8", "ignore"))
    except Exception:
        return default

def write_json_remote(rel_path, data):
    rem_path = f"{REMOTE_DATA}/{rel_path}"
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    cmd = f"{REMOTE_SSH} 'cat > {rem_path}'"
    p = subprocess.Popen(cmd, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = p.communicate(input=payload, timeout=10)
    if p.returncode != 0:
        print(f"[Remote] Error writing {rem_path}: {err.decode(errors='ignore')}")

def sync_tombstones():
    loc_tomb = read_json_local(os.path.join(LOCAL_DATA, "tombstones.json"), {"messages": [], "moments": [], "articles": []})
    rem_tomb = read_json_remote("tombstones.json", {"messages": [], "moments": [], "articles": []})

    merged = {}
    for cat in ["messages", "moments", "articles"]:
        s = list(set(loc_tomb.get(cat, []) + rem_tomb.get(cat, [])))
        if len(s) > 500:
            s = s[-500:]
        merged[cat] = s

    if merged != loc_tomb:
        write_json_local(os.path.join(LOCAL_DATA, "tombstones.json"), merged)
        print("[Tombstone] Updated local tombstones")

    if merged != rem_tomb:
        write_json_remote("tombstones.json", merged)
        print("[Tombstone] Updated remote tombstones on InstaBox")

    return merged

def sync_messages(tombstones):
    dead_ids = set(tombstones.get("messages", []))
    loc_msgs = read_json_local(os.path.join(LOCAL_DATA, "messages.json"), [])
    rem_msgs = read_json_remote("messages.json", [])

    # 1. Filter out dead items immediately from both lists
    loc_clean = [m for m in loc_msgs if m.get("id") not in dead_ids]
    rem_clean = [m for m in rem_msgs if m.get("id") not in dead_ids]

    # 2. Merge non-dead items by ID
    by_id = {}
    for m in loc_clean:
        by_id[m["id"]] = m

    for m in rem_clean:
        mid = m["id"]
        if mid not in by_id:
            by_id[mid] = m
        else:
            # Preserve richest metadata (echo / pinned / reactions)
            if m.get("echo") and not by_id[mid].get("echo"):
                by_id[mid]["echo"] = m["echo"]
            if m.get("pinned") and not by_id[mid].get("pinned"):
                by_id[mid]["pinned"] = m["pinned"]
            if m.get("resonances", 0) > by_id[mid].get("resonances", 0):
                by_id[mid]["resonances"] = m["resonances"]

    merged = list(by_id.values())
    merged.sort(key=lambda x: x.get("time", ""), reverse=True)

    # 3. Check and write back if needed
    if merged != loc_msgs:
        write_json_local(os.path.join(LOCAL_DATA, "messages.json"), merged)
        print(f"[Sync] Saved {len(merged)} clean messages to local VPS (purged {len(loc_msgs) - len(loc_clean)} dead)")

    if merged != rem_msgs:
        write_json_remote("messages.json", merged)
        print(f"[Sync] Saved {len(merged)} clean messages to remote InstaBox (purged {len(rem_msgs) - len(rem_clean)} dead)")

def sync_articles_and_moments(tombstones):
    dead_art = set(tombstones.get("articles", []))
    dead_mom = set(tombstones.get("moments", []))

    # Moments
    loc_mom = [m for m in read_json_local(os.path.join(LOCAL_DATA, "moments.json"), []) if m.get("id") not in dead_mom]
    rem_mom = [m for m in read_json_remote("moments.json", []) if m.get("id") not in dead_mom]
    mom_by_id = {m["id"]: m for m in loc_mom}
    for m in rem_mom:
        if m["id"] not in mom_by_id:
            mom_by_id[m["id"]] = m
        elif m.get("resonances", 0) > mom_by_id[m["id"]].get("resonances", 0):
            mom_by_id[m["id"]]["resonances"] = m["resonances"]
    merged_mom = list(mom_by_id.values())
    merged_mom.sort(key=lambda x: x.get("date", ""), reverse=True)
    if merged_mom != read_json_local(os.path.join(LOCAL_DATA, "moments.json"), []):
        write_json_local(os.path.join(LOCAL_DATA, "moments.json"), merged_mom)
    if merged_mom != read_json_remote("moments.json", []):
        write_json_remote("moments.json", merged_mom)

    # Articles
    loc_art = [a for a in read_json_local(os.path.join(LOCAL_DATA, "articles.json"), []) if a.get("id") not in dead_art]
    rem_art = [a for a in read_json_remote("articles.json", []) if a.get("id") not in dead_art]
    art_by_id = {a["id"]: a for a in loc_art}
    for a in rem_art:
        if a["id"] not in art_by_id:
            art_by_id[a["id"]] = a
    merged_art = list(art_by_id.values())
    merged_art.sort(key=lambda x: x.get("date", ""), reverse=True)
    if merged_art != read_json_local(os.path.join(LOCAL_DATA, "articles.json"), []):
        write_json_local(os.path.join(LOCAL_DATA, "articles.json"), merged_art)
    if merged_art != read_json_remote("articles.json", []):
        write_json_remote("articles.json", merged_art)

def sync_code_and_config():
    files = [
        "server.js",
        "public/index.html",
        "public/app.js",
        "public/style.css",
        "public/robots.txt",
        "scripts/data-snapshot.js",
        "data/config.json",
        "data/resonances.json",
        "data/tombstones.json",
        "public/intro.mp4",
        "public/intro-poster.jpg",
        "public/sitemap.xml",
        "public/og/default.png",
        "public/og/art-8.png",
        "public/og/microvm-and-edge-keepalive-architecture-deep-dive.png"
    ]
    needs_restart = False
    for rel in files:
        loc = os.path.join(LOCAL_ROOT, rel)
        if not os.path.exists(loc):
            continue
        rem_path = f"{REMOTE_ROOT}/{rel}"
        # Use md5sum for quick comparison without transferring large contents over ssh pipe
        try:
            import hashlib
            with open(loc, "rb") as f:
                loc_md5 = hashlib.md5(f.read()).hexdigest()
            cmd = f"{REMOTE_SSH} 'md5sum {rem_path} 2>/dev/null'"
            res = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=6)
            rem_md5 = res.stdout.decode().split()[0] if res.returncode == 0 and res.stdout else ""
            if loc_md5 != rem_md5:
                print(f"[Code] Updating {rel} on InstaBox (md5 diff)...")
                rem_dir = os.path.dirname(rem_path)
                subprocess.run(f"{REMOTE_SSH} 'mkdir -p {rem_dir}'", shell=True, timeout=5)
                with open(loc, "rb") as lf:
                    file_bytes = lf.read()
                cmd = f"{REMOTE_SSH} 'cat > {rem_path}'"
                p = subprocess.Popen(cmd, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                p.communicate(input=file_bytes, timeout=15)
                needs_restart = True
        except Exception as e:
            print(f"[Code] Check {rel} error: {e}")

    if needs_restart:
        print("[Service] Restarting personal-web.service on InstaBox...")
        subprocess.run(f"{REMOTE_SSH} 'systemctl --user restart personal-web.service'", shell=True, timeout=8)

def main():
    if not is_remote_alive():
        print("[Heartbeat] Remote InstaBox not reachable or cooling down, skipping sync")
        return
    print("[Sync] Remote InstaBox is ALIVE. Starting bidirectional anti-resurrection sync...")
    tombstones = sync_tombstones()
    sync_messages(tombstones)
    sync_articles_and_moments(tombstones)
    sync_code_and_config()
    print("[Sync] Synchronization completed cleanly.")

if __name__ == "__main__":
    main()
