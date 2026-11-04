#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Image Generation Utility via Grok/Gork (pipiwang)
Usage:
  python generate_image.py "prompt description" output_path.png
"""
import sys
import os
import json
import time
import urllib.request

API_KEY = os.environ.get("IMAGE_GEN_API_KEY", "sk-Tkh8xl7XqIlbiGje1wI9g6HJBnCSZqFBm2W9ym5Q")
BASE_URL = os.environ.get("IMAGE_GEN_BASE_URL", "https://img.pipiwangcom.com/v1")
MODEL = os.environ.get("IMAGE_GEN_MODEL", "gork")

def generate_image(prompt: str, output_path: str = None, timeout: int = 60) -> str:
    url = f"{BASE_URL.rstrip('/')}/images/generations"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    payload = {
        "model": MODEL,
        "prompt": prompt
    }
    
    print(f"[ImageGen] Generating with model '{MODEL}' at {url}...")
    t0 = time.time()
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        res = json.loads(resp.read().decode("utf-8"))
    
    elapsed = time.time() - t0
    data = res.get("data", [])
    if not data or "url" not in data[0]:
        raise RuntimeError(f"Unexpected response: {res}")
    
    img_url = data[0]["url"]
    print(f"[ImageGen] Completed in {elapsed:.2f}s. Image URL: {img_url}")
    
    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        img_req = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(img_req, timeout=30) as r, open(output_path, "wb") as f:
            f.write(r.read())
        print(f"[ImageGen] Saved image to {output_path}")
        return output_path
    
    return img_url

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_image.py <prompt> [output_path]")
        sys.exit(1)
    
    prompt_text = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else "generated_image.png"
    generate_image(prompt_text, out_file)
