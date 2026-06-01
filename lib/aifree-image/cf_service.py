"""
lib/aifree-image/cf_service.py
Cloudflare-bypass service for aifreeforever.com
Strategy: cloudscraper (TLS+JS emulation) → direct API probing → hardcoded models fallback
Exposes a local HTTP API on port 7891.
"""
import sys, json, base64, time, threading, re, subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Install cloudscraper if missing ──────────────────────────────────────────
try:
    import cloudscraper
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "cloudscraper", "-q"])
    import cloudscraper

PORT   = 7891
AIFREE = "https://aifreeforever.com"
_SESSION = None
_LOCK    = threading.Lock()

# ── All known models on aifreeforever.com (curated + user-requested) ─────────
FULL_MODEL_LIST = [
    # ── FLUX family ───────────────────────────────────────────────────────────
    {"id": "flux-schnell",          "label": "⚡ FLUX Schnell",      "badge": "FAST"},
    {"id": "flux-dev",              "label": "🎯 FLUX Dev",          "badge": "HD"},
    {"id": "flux-pro",              "label": "💎 FLUX Pro",          "badge": "PRO"},
    {"id": "flux-1.1-pro",         "label": "🚀 FLUX 1.1 Pro",      "badge": "NEW"},
    # ── Stable Diffusion ──────────────────────────────────────────────────────
    {"id": "stable-diffusion-3.5-large",  "label": "🖼️ SD 3.5 Large",  "badge": "HD"},
    {"id": "stable-diffusion-3.5-medium", "label": "🖼️ SD 3.5 Medium", "badge": ""},
    {"id": "sdxl-lightning",              "label": "⚡ SDXL Lightning", "badge": ""},
    # ── Other image models ────────────────────────────────────────────────────
    {"id": "playground-v2.5",      "label": "🎮 Playground 2.5",    "badge": ""},
    {"id": "juggernaut-xl",        "label": "💪 Juggernaut XL",     "badge": ""},
    {"id": "realvisxl",            "label": "📷 RealVis XL",        "badge": "REAL"},
    # ── GPT Image ─────────────────────────────────────────────────────────────
    {"id": "gpt-image-1",          "label": "🤖 GPT Image 1",       "badge": "GPT"},
    {"id": "gpt-image-2",          "label": "✨ GPT Image 2",       "badge": "NEW"},
    # ── ByteDance Seedream ────────────────────────────────────────────────────
    {"id": "seedream",             "label": "🌱 Seedream",           "badge": "ByteDance"},
    {"id": "seedream-3",           "label": "🌿 Seedream 3.0",      "badge": "NEW"},
    # ── Nano Banana Pro ───────────────────────────────────────────────────────
    {"id": "nano-banana-pro",      "label": "🍌 Nano Banana Pro",   "badge": "PRO"},
]

CHROME_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8,fr;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
}

def get_session():
    global _SESSION
    with _LOCK:
        if _SESSION is None:
            _SESSION = cloudscraper.create_scraper(
                browser={"browser": "chrome", "platform": "windows", "mobile": False},
                delay=8,
            )
            # Warm-up request to establish cookies/CF clearance
            try:
                r = _SESSION.get(
                    AIFREE + "/image-generators",
                    headers={**CHROME_HEADERS, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
                    timeout=35,
                )
                print(f"[aifree-cf] warm-up status={r.status_code} cookies={len(r.cookies)}", flush=True)
            except Exception as e:
                print(f"[aifree-cf] warm-up error: {e}", flush=True)
    return _SESSION

def discover_models_from_page():
    """Try to extract models dynamically from aifreeforever.com."""
    try:
        s = get_session()
        r = s.get(
            AIFREE + "/image-generators",
            headers={**CHROME_HEADERS, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
            timeout=25,
        )
        if r.status_code != 200:
            print(f"[aifree-cf] discover: HTTP {r.status_code}", flush=True)
            return None

        html = r.text
        found_ids = set()
        result = []

        # Strategy 1: data-model="..." attributes
        for m in re.findall(r'data-model=["\']([^"\']+)["\']', html):
            if m not in found_ids:
                found_ids.add(m)
                label = m.replace("-", " ").title()
                result.append({"id": m, "label": label, "badge": ""})

        # Strategy 2: value="model-id" inside <option> tags
        for m in re.findall(r'<option[^>]+value=["\']([a-z0-9\-\.]+)["\']', html):
            if m not in found_ids and len(m) > 3:
                found_ids.add(m)
                result.append({"id": m, "label": m.replace("-", " ").title(), "badge": ""})

        # Strategy 3: JSON arrays {"models":[...]}
        for block in re.findall(r'"models"\s*:\s*\[([^\]]+)\]', html):
            for m in re.findall(r'"([a-z0-9\-\.]{4,})"', block):
                if m not in found_ids:
                    found_ids.add(m)
                    result.append({"id": m, "label": m.replace("-", " ").title(), "badge": ""})

        # Strategy 4: __NEXT_DATA__ or window.__data__ JSON blobs
        for script_content in re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL):
            if 'model' in script_content.lower():
                for m in re.findall(r'"model(?:Id|Name|Slug)?"\s*:\s*"([a-z0-9\-\.]{4,})"', script_content):
                    if m not in found_ids:
                        found_ids.add(m)
                        result.append({"id": m, "label": m.replace("-", " ").title(), "badge": ""})

        if result:
            print(f"[aifree-cf] discovered {len(result)} models from page", flush=True)
            return enrich_models(result)

    except Exception as e:
        print(f"[aifree-cf] discover_models error: {e}", flush=True)

    return None

def enrich_models(dynamic_models):
    """Merge dynamic models with our curated list for proper labels/badges."""
    curated = {m["id"]: m for m in FULL_MODEL_LIST}
    enriched = []
    seen_ids = set()
    for m in dynamic_models:
        mid = m["id"]
        seen_ids.add(mid)
        if mid in curated:
            enriched.append(curated[mid])
        else:
            enriched.append(m)
    # Add curated models not found dynamically
    for m in FULL_MODEL_LIST:
        if m["id"] not in seen_ids:
            enriched.append(m)
    return enriched

# Cache for discovered models (refresh every 30 min)
_models_cache = None
_models_ts    = 0
MODEL_TTL     = 30 * 60

def get_models():
    global _models_cache, _models_ts
    now = time.time()
    if _models_cache and (now - _models_ts) < MODEL_TTL:
        return _models_cache
    dynamic = discover_models_from_page()
    if dynamic:
        _models_cache = dynamic
    else:
        _models_cache = FULL_MODEL_LIST
    _models_ts = now
    return _models_cache

def generate_image(prompt, model="flux-schnell", width=768, height=768, steps=25):
    s = get_session()

    payload = {
        "prompt":               prompt,
        "model":                model,
        "width":                width,
        "height":               height,
        "num_inference_steps":  steps,
        "guidance_scale":       7.0,
    }

    gen_headers = {
        **CHROME_HEADERS,
        "Content-Type":    "application/json",
        "Accept":          "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        "Origin":          AIFREE,
        "Referer":         AIFREE + "/image-generators",
        "Sec-Fetch-Dest":  "empty",
        "Sec-Fetch-Mode":  "cors",
        "Sec-Fetch-Site":  "same-origin",
    }

    # Ordered API endpoint candidates (reverse-engineered)
    candidates = [
        f"{AIFREE}/api/generate-image",
        f"{AIFREE}/api/image/generate",
        f"{AIFREE}/api/generate",
        f"{AIFREE}/api/text-to-image",
        f"{AIFREE}/api/images/generate",
        f"{AIFREE}/generate-image",
        f"{AIFREE}/generate",
    ]

    tried = []
    for url in candidates:
        try:
            r = s.post(url, json=payload, headers=gen_headers, timeout=90)
            tried.append(f"{url}→{r.status_code}")
            ct = r.headers.get("content-type", "")

            if r.status_code in (200, 201):
                # Raw image bytes
                if "image/" in ct:
                    b64  = base64.b64encode(r.content).decode()
                    mime = ct.split(";")[0].strip()
                    return {
                        "ok": True, "imageBase64": b64, "mime": mime,
                        "model": model, "provider": "aifreeforever", "endpoint": url,
                    }
                # JSON response
                try:
                    data    = r.json()
                    img_url = (
                        data.get("url") or data.get("image_url") or data.get("imageUrl")
                        or data.get("image") or data.get("output")
                        or (data.get("data") or [None])[0]
                        or ((data.get("data") or {}).get("url"))
                    )
                    if img_url:
                        return {
                            "ok": True, "imageUrl": img_url,
                            "model": model, "provider": "aifreeforever", "endpoint": url,
                        }
                    b64 = data.get("base64") or data.get("imageBase64") or data.get("image_base64")
                    if b64:
                        return {
                            "ok": True, "imageBase64": b64, "mime": "image/png",
                            "model": model, "provider": "aifreeforever", "endpoint": url,
                        }
                    # Error in JSON
                    err_msg = data.get("error") or data.get("message") or data.get("detail")
                    if err_msg:
                        print(f"[aifree-cf] {url} JSON error: {err_msg}", flush=True)
                except Exception:
                    pass

            elif r.status_code in (401, 403):
                # Cloudflare or auth block — stop trying further
                print(f"[aifree-cf] {url} blocked ({r.status_code})", flush=True)
                break

        except Exception as e:
            tried.append(f"{url}→ERR:{e}")
            print(f"[aifree-cf] {url} → {e}", flush=True)

    return {
        "ok":    False,
        "error": "تعذّر الاتصال بـ aifreeforever.com — الحماية أقوى من المتوقع، جرّب لاحقاً",
        "tried": tried,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type",  "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "aifree-cf", "port": PORT})
        elif self.path == "/models":
            self.send_json(200, {"ok": True, "models": get_models()})
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

        model  = body.get("model",  "flux-schnell")
        width  = int(body.get("width",  768))
        height = int(body.get("height", 768))
        steps  = int(body.get("steps",  25))

        result = generate_image(prompt, model, width, height, steps)
        self.send_json(200 if result["ok"] else 502, result)


if __name__ == "__main__":
    print(f"[aifree-cf] Starting CF-bypass service on port {PORT} ...", flush=True)
    # Warm up in background so /health responds immediately
    threading.Thread(target=get_session, daemon=True).start()
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[aifree-cf] Ready ✓ — http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
