"""Usage: python3 scripts/brand-logos.py public/brand
Prepare the DataDank logo assets from the supplied transparent files (no redrawing or recolouring).
Compact lockup = full lockup with only the tagline row erased; the logo sheet's compact variant has the same
mark/wordmark proportions."""
import numpy as np, os, sys
from PIL import Image
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'brand', 'source'); OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
def load(f): return np.asarray(Image.open(f'{B}/{f}').convert('RGBA')).copy()
def trim(a):
    ys, xs = np.where(a[..., 3] > 6); return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
def save(a, name, h):
    im = Image.fromarray(a, 'RGBA'); im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    im.save(f'{OUT}/{name}', 'WEBP', quality=92, method=6); print(name, im.size, os.path.getsize(f'{OUT}/{name}'))
def compact(a, text_x, tagline_y):
    c = a.copy(); c[tagline_y:, text_x:, 3] = 0; return trim(c)
light, dark = load('datadank-logo-light-original.webp'), load('datadank-logo-dark-original.webp')
save(trim(light), 'datadank-logo-light.webp', 240)
save(trim(dark), 'datadank-logo-dark.webp', 240)
save(compact(light, 580, 436), 'datadank-logo-compact-light.webp', 96)
save(compact(dark, 570, 422), 'datadank-logo-compact-dark.webp', 96)
save(trim(load('datadank-mark-original.webp')), 'datadank-mark.webp', 256)
