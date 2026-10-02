"""Convert raw renders from tools/render-assets.mjs into web-ready files.
Usage: python3 tools/optimise-images.py <tmp-dir> <repo-root>   (needs Pillow)"""
import sys, os
from PIL import Image

tmp, root = sys.argv[1], sys.argv[2]
fleet = os.path.join(root, 'assets/img/fleet')
img = os.path.join(root, 'assets/img')
os.makedirs(fleet, exist_ok=True)

def trim_pad(im, pad_ratio=0.04):
    """Crop transparent margins, then re-pad to the original aspect ratio so the aircraft fills the frame."""
    w, h = im.size
    bbox = im.getchannel('A').getbbox()
    if not bbox:
        return im
    cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    aspect = w / h
    tw = max(cw, ch * aspect) * (1 + pad_ratio * 2)
    th = tw / aspect
    box = (int(cx - tw / 2), int(cy - th / 2), int(cx + tw / 2), int(cy + th / 2))
    canvas = Image.new('RGBA', (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
    canvas.paste(im.crop((max(box[0], 0), max(box[1], 0), min(box[2], w), min(box[3], h))), (max(-box[0], 0), max(-box[1], 0)))
    return canvas

for f in sorted(os.listdir(tmp)):
    src = os.path.join(tmp, f)
    name, _ = os.path.splitext(f)
    im = Image.open(src)
    if name.endswith('-34'):
        im = trim_pad(im.convert('RGBA'), 0.03).resize((1280, 720), Image.LANCZOS)
        im.save(os.path.join(fleet, name + '.webp'), 'WEBP', quality=86, method=6)
    elif name.endswith('-side'):
        im = trim_pad(im.convert('RGBA'), 0.02).resize((1280, 400), Image.LANCZOS)
        im.save(os.path.join(fleet, name + '.webp'), 'WEBP', quality=86, method=6)
    elif name.endswith('-og'):
        im.convert('RGB').save(os.path.join(fleet, name + '.jpg'), 'JPEG', quality=86, optimize=True, progressive=True)
    elif name == 'hero-dusk':
        im.convert('RGB').save(os.path.join(img, 'hero-dusk.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)
    elif name == 'og':
        im.convert('RGB').save(os.path.join(img, 'og.jpg'), 'JPEG', quality=86, optimize=True, progressive=True)
    elif name == 'favicon':
        im.save(os.path.join(root, 'favicon.png'), 'PNG', optimize=True)
    elif name in ('apple-touch-icon', 'icon-192', 'icon-512'):
        im.convert('RGB').save(os.path.join(img, name + '.png'), 'PNG', optimize=True)
    print('  →', name)
