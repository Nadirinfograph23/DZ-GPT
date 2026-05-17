import sys, json, base64, io
import numpy as np
from PIL import Image
from skimage.restoration import inpaint_biharmonic

MAX_DIM = 512

def run():
    data = json.loads(sys.stdin.read())
    img_bytes  = base64.b64decode(data['image'])
    mask_bytes = base64.b64decode(data['mask'])

    img  = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    mask = Image.open(io.BytesIO(mask_bytes)).convert('L')

    orig_w, orig_h = img.size

    scale = min(1.0, MAX_DIM / max(orig_w, orig_h, 1))
    if scale < 1.0:
        new_w = max(1, int(orig_w * scale))
        new_h = max(1, int(orig_h * scale))
        img  = img.resize((new_w, new_h), Image.LANCZOS)
        mask = mask.resize((new_w, new_h), Image.NEAREST)

    img_arr  = np.array(img, dtype=np.float64) / 255.0
    mask_arr = (np.array(mask) > 127)

    known = ~mask_arr
    if not known.any():
        sys.stderr.write("القناع يغطي الصورة بالكامل — قلّل منطقة الرسم")
        sys.exit(1)
    if not mask_arr.any():
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        sys.stdout.write(base64.b64encode(buf.getvalue()).decode())
        sys.stdout.flush()
        return

    result = inpaint_biharmonic(img_arr, mask_arr, channel_axis=-1)
    result_img = Image.fromarray((np.clip(result, 0, 1) * 255).astype(np.uint8))

    if scale < 1.0:
        result_img = result_img.resize((orig_w, orig_h), Image.LANCZOS)

    buf = io.BytesIO()
    result_img.save(buf, format='PNG')
    sys.stdout.write(base64.b64encode(buf.getvalue()).decode())
    sys.stdout.flush()

if __name__ == '__main__':
    run()
