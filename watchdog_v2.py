#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
InstaBox Advanced Watchdog & Auto-Healer Probe
Runs on Tencent Cloud VPS (81.70.169.192)
Monitors machine state, detects cooldown expiration, automatically sends POST /resume,
renews activity lease, knocks SSH gateway, and probes web health.
"""
import os, sys, json, time, urllib.request, socket, uuid, datetime

API_KEY = "ibk_g75vrpvnc5xieywammsjqtf2deoihpdbva2crmda543mgtfh22ra"
MACHINE_ID = "m_agqzolqduaqwcjbi6witeq4fla"
LEASE_ID = "ib-vps-m_agqzolqduaqwcjbi6witeq4fla"
WEB_URL = "https://hlat.top"
LOG_FILE = "/opt/instabox-watchdog/watchdog.log"

now = time.strftime("%Y-%m-%d %H:%M:%S")

# 1. Inspect Machine Status
state = "unknown"
cooldown_until = None
remaining_cooldown = 0
action_log = []

try:
    url = f"https://api.instabox.sh/v1/machines/{MACHINE_ID}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {API_KEY}"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        m_data = json.loads(resp.read().decode())
        state = m_data.get("state", "unknown")
        cooldown_until = m_data.get("cooldownUntil")
        if cooldown_until:
            cd_time = datetime.datetime.strptime(cooldown_until[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc)
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            remaining_cooldown = (cd_time - now_utc).total_seconds()
except Exception as e:
    action_log.append(f"InspectErr({e})")

# 2. State Machine Handling
if state == "suspended":
    if remaining_cooldown <= 0:
        # Cooldown expired, trigger auto-resume
        try:
            resume_url = f"https://api.instabox.sh/v1/machines/{MACHINE_ID}/resume"
            req = urllib.request.Request(resume_url, headers={
                "Authorization": f"Bearer {API_KEY}",
                "Idempotency-Key": str(uuid.uuid4())
            }, method="POST")
            with urllib.request.urlopen(req, timeout=15) as resp:
                action_log.append(f"AutoResume(OK-{resp.status})")
        except urllib.error.HTTPError as e:
            action_log.append(f"AutoResumeErr({e.code})")
        except Exception as e:
            action_log.append(f"AutoResumeErr({e})")
    else:
        mins = remaining_cooldown / 60.0
        action_log.append(f"CooldownRemaining({mins:.1f}m until {cooldown_until[:19].replace('T', ' ')}Z)")

elif state == "running":
    # Machine is running: Renew Activity Lease
    try:
        lease_url = f"https://api.instabox.sh/v1/machines/{MACHINE_ID}/activity-leases/{LEASE_ID}"
        data = json.dumps({"ttlSeconds": 1800}).encode("utf-8")
        req = urllib.request.Request(lease_url, data=data, headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }, method="PUT")
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode())
            exp = res.get("expiresAt", "")
            action_log.append(f"LeaseOK(exp: {exp[:19].replace('T', ' ')})")
    except Exception as e:
        action_log.append(f"LeaseErr({e})")

    # Bidirectional Data Sync
    try:
        import subprocess
        res = subprocess.run(["python3", "/opt/sxtx-atelier/sync_atelier.py"], timeout=12, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        action_log.append("DataSync(OK)")
    except Exception as e:
        action_log.append(f"DataSyncErr({e})")

# 3. SSH Gateway Knock
ssh_status = "FAIL"
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(8)
    s.connect(("ssh.instabox.sh", 2222))
    s.recv(1024)
    s.close()
    ssh_status = "OK"
except Exception as e:
    ssh_status = f"ERR({e})"

# 4. Web Health Check
web_status = "FAIL"
try:
    req = urllib.request.Request(WEB_URL, headers={"User-Agent": "TencentVPS-Watchdog/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        web_status = f"HTTP {resp.status}"
except urllib.error.HTTPError as e:
    web_status = f"HTTP {e.code}"
except Exception as e:
    web_status = f"ERR({e})"

log_line = f"[{now}] State: {state} | Action: {', '.join(action_log)} | SSH Knock: {ssh_status} | Web: {web_status}"
print(log_line)

# Auto-truncate log file
try:
    if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > 512000:
        with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.writelines(lines[-200:])
except Exception:
    pass
