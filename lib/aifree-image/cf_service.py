"""
lib/aifree-image/cf_service.py
Lightweight Cloudflare-bypass service (FlareSolverr-style) for aifreeforever.com
Uses curl_cffi to impersonate Chrome TLS fingerprint — no headless browser needed
for CF JS-Challenge level.  Exposes a local HTTP API on port 7891.
"""
import sys, json, base64, time, threading, re
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    import subprocess, sys as _sys
    subprocess.check_call([_sys.executable, "-m", "pip", "install", "curl_cffi", "-q"])
    from curl_cffi import requests as cffi_requests

PORT     = 7891
AIFREE   = "https://aifreeforever.com"
_SESSION = None
_LOCK    = threading.Lock()

CHROME_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8,fr;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
}

# Known model IDs on the site (updated via /models endpoint)
DEFAULT_MODELS = [
    {"id": "stable-diffusion-3.5-large", "label": "SD 3.5 Large",  "badge": "HD"},
    {"id": "stable-diffusion-3.5-medium","label": "SD 3.5 Medium", "badge": ""},
    {"id": "flux-schnell",                "label": "FLUX Schnell",  "badge": "FAST"},
    {"id": "flux-dev",                    "label": "FLUX Dev",      "badge": "QUALITY"},
    {"id": "sdxl-lightning",              "label": "SDXL Lightning","badge": ""},
    {"id": "playground-v2.5",             "label": "Playground 2.5","badge": ""},
    {"id": "juggernaut-xl",               "label": "Juggernaut XL", "badge": ""},
    {"id": "realvisxl",                   "label": "RealVis XL",    "badge": "REAL"},
]

def get_session():
    global _SESSION
    with _LOCK:
        if _SESSION is None:
            _SESSION = cffi_requests.Session(impersonate="chrome131")
            try:
                r = _SESSION.get(
                    AIFREE + "/image-generators",
                    headers={**CHROME_HEADERS, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
                    timeout=30,
                )
                print(f"[aifree-cf] warm-up status={r.status_code} cookies={len(r.cookies)}", flush=True)
            except Exception as e:
                print(f"[aifree-cf] warm-up error: {e}", flush=True)
    return _SESSION

def discover_models():
    """Try to extract model list from the live page."""
    try:
        s = get_session()
        r = s.get(
            AIFREE + "/image-generators",
            headers={**CHROME_HEADERS, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
            timeout=20,
        )
        html = r.text
        found = []
        # data-model="..." attributes
        for m in re.findall(r'data-model=["\']([^"\']+)["\']', html):
            found.append({"id": m, "label": m.replace("-", " ").title(), "badge": ""})
        # JSON arrays: "models":[...]
        for block in re.findall(r'"models"\s*:\s*\[([^\]]+)\]', html):
            for m in re.findall(r'"([a-z0-9\-\.]+)"', block):
                if m not in [x["id"] for x in found]:
                    found.append({"id": m, "label": m.replace("-", " ").title(), "badge": ""})
        if found:
            return found
    except Exception as e:
        print(f"[aifree-cf] discover error: {e}", flush=True)
    return DEFAULT_MODELS

def generate_image(prompt, model="flux-schnell", width=768, height=768, steps=25):
    s = get_session()
    payload = {
        "prompt": prompt,
        "model": model,
        "width": width,
        "height": height,
        "num_inference_steps": steps,
        "guidance_scale": 7.0,
    }
    gen_headers = {
        **CHROME_HEADERS,
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": AIFREE,
        "Referer": AIFREE + "/image-generators",
    }

    # Ordered list of endpoints to try (reverse-engineered common patterns)
    candidates = [
        f"{AIFREE}/api/generate-image",
        f"{AIFREE}/api/image/generate",
        f"{AIFREE}/api/generate",
        f"{AIFREE}/api/text-to-image",
        f"{AIFREE}/generate",
    ]

    for url in candidates:
        try:
            r = s.post(url, json=payload, headers=gen_headers, timeout=90)
            ct = r.headers.get("content-type", "")
            if r.status_code in (200, 201):
                # Raw image bytes
                if "image/" in ct:
                    b64 = base64.b64encode(r.content).decode()
                    mime = ct.split(";")[0].strip()
                    return {"ok": True, "imageBase64": b64, "mime": mime,
                            "model": model, "provider": "aifreeforever", "endpoint": url}
                # JSON response
                try:
                    data = r.json()
                    img_url = (data.get("url") or data.get("image_url") or data.get("imageUrl")
                               or data.get("image") or data.get("output")
                               or (data.get("data") or {}).get("url"))
                    if img_url:
                        return {"ok": True, "imageUrl": img_url, "model": model,
                                "provider": "aifreeforever", "endpoint": url}
                    b64 = (data.get("base64") or data.get("imageBase64") or data.get("image_base64"))
                    if b64:
                        return {"ok": True, "imageBase64": b64, "mime": "image/png",
                                "model": model, "provider": "aifreeforever", "endpoint": url}
                except Exception:
                    pass
        except Exception as e:
            print(f"[aifree-cf] {url} → {e}", flush=True)

    return {"ok": False,
            "error": "تعذّر الاتصال بـ aifreeforever.com — قد تكون الحماية أقوى من JS-Challenge",
            "tried": candidates}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "aifree-cf", "port": PORT})
        elif self.path == "/models":
            self.send_json(200, {"ok": True, "models": discover_models()})
        else:
            self.send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        if self.path != "/generate":
            self.send_json(404, {"ok": False, "error": "Not found"}); return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            self.send_json(400, {"ok": False, "error": "Invalid JSON"}); return

        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            self.send_json(400, {"ok": False, "error": "prompt required"}); return

        model  = body.get("model", "flux-schnell")
        width  = int(body.get("width", 768))
        height = int(body.get("height", 768))
        steps  = int(body.get("steps", 25))

        result = generate_image(prompt, model, width, height, steps)
        self.send_json(200 if result["ok"] else 502, result)


if __name__ == "__main__":
    print(f"[aifree-cf] Starting CF-bypass service on port {PORT} ...", flush=True)
    get_session()   # warm up in foreground before accepting requests
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[aifree-cf] Ready ✓ — http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
