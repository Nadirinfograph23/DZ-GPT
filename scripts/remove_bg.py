import sys, json, base64, io, numpy as np
from PIL import Image, ImageFilter
from rembg import remove, new_session

data   = json.loads(sys.stdin.buffer.read())
b64    = data['image']
method = data.get('method', 'alpha_matting')
img_bytes = base64.b64decode(b64)

session = new_session('u2net')

if method == 'alpha_matting':
    result_bytes = remove(
        img_bytes,
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
    )
else:
    result_bytes = remove(img_bytes, session=session)

result_img = Image.open(io.BytesIO(result_bytes)).convert('RGBA')

r, g, b, a = result_img.split()
a_np = np.array(a, dtype=np.float32)

# ── Smooth the alpha channel to remove jagged edges ──────────────────────
# 1. Slight Gaussian-like smooth on semi-transparent zone
a_pil = Image.fromarray(a_np.astype(np.uint8))
a_smooth = a_pil.filter(ImageFilter.GaussianBlur(radius=1.2))
a_np2 = np.array(a_smooth, dtype=np.float32)

# 2. Contrast boost in the edge zone: fully transparent stays 0,
#    fully opaque stays 255, middle zone gets pushed to extremes
edge_mask = (a_np2 > 5) & (a_np2 < 250)
a_np2[edge_mask] = np.clip(
    (a_np2[edge_mask] - 80) * (255.0 / (250.0 - 80.0)),
    0, 255
)

a_final = Image.fromarray(a_np2.astype(np.uint8))
result_img.putalpha(a_final)

out = io.BytesIO()
result_img.save(out, format='PNG', optimize=True)
out.seek(0)
sys.stdout.write(base64.b64encode(out.read()).decode())
sys.stdout.flush()
