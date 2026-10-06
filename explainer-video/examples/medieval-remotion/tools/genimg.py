"""Generate illustrations with Gemini image models. Key from $GEMINI_API_KEY or Keychain; sent only in a header.
usage: python tools/genimg.py <out.png> "<prompt>" [--model M] [--aspect 1:1] [--ref img.png]
"""
import argparse, base64, json, os, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

def key():
    k = os.environ.get("GEMINI_API_KEY")
    if not k:
        k = subprocess.run(["security", "find-generic-password", "-s", "gemini-api-key", "-w"],
                           capture_output=True, text=True).stdout.strip()
    if not k: sys.exit("no Gemini key")
    return k

def gen(out, prompt, model="gemini-3-pro-image", aspect="1:1", refs=(), size=None):
    parts = [{"text": prompt}]
    for r in refs:
        parts.append({"inline_data": {"mime_type": "image/png", "data": base64.b64encode(Path(r).read_bytes()).decode()}})
    body = {"contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, **({"imageSize": size} if size else {})}}}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    for attempt in range(5):
        req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                     headers={"x-goog-api-key": key(), "Content-Type": "application/json"})
        try:
            data = json.load(urllib.request.urlopen(req, timeout=300))
            for c in data.get("candidates", []):
                for p in c.get("content", {}).get("parts", []):
                    d = p.get("inlineData") or p.get("inline_data")
                    if d:
                        Path(out).parent.mkdir(parents=True, exist_ok=True)
                        Path(out).write_bytes(base64.b64decode(d["data"]))
                        print("ok", out); return True
            print("no image in response:", json.dumps(data)[:300])
        except urllib.error.HTTPError as e:
            print("http", e.code, e.read()[:200])
        time.sleep(5 * (attempt + 1))
    return False

if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("out"); a.add_argument("prompt")
    a.add_argument("--model", default="gemini-3-pro-image"); a.add_argument("--aspect", default="1:1")
    a.add_argument("--ref", action="append", default=[]); a.add_argument("--size")
    x = a.parse_args()
    sys.exit(0 if gen(x.out, x.prompt, x.model, x.aspect, x.ref, x.size) else 1)
