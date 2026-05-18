import sys, json, base64, io
from PIL import Image
from rembg import remove

data = json.loads(sys.stdin.buffer.read())
img_bytes = base64.b64decode(data['image'])

result_bytes = remove(img_bytes)

out = io.BytesIO()
Image.open(io.BytesIO(result_bytes)).save(out, format='PNG')
out.seek(0)
sys.stdout.write(base64.b64encode(out.read()).decode())
sys.stdout.flush()
