"""Favicon, Apple touch and manifest icons from the supplied DataDank app icon (no redrawing).
Usage: python3 scripts/brand-icons.py <out-dir>   (then copy <out-dir>/root/* to public/)"""
import numpy as np, sys, os
from PIL import Image
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'brand', 'source')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)

def unmix(rgb, bg, t):
    """alpha from distance to background (full opacity beyond t), then un-premultiply edge colours."""
    d = np.sqrt(((rgb - bg) ** 2).sum(-1))
    a = np.clip((d - 4) / (t - 4), 0, 1)          # 4-level dead zone absorbs background noise
    with np.errstate(invalid='ignore', divide='ignore'):
        fg = (rgb - (1 - a[..., None]) * bg) / a[..., None]
    fg = np.where(a[..., None] > 0, np.clip(fg, 0, 255), 0)
    return np.dstack([fg, a * 255]).astype(np.uint8)

def trim(arr, pad):
    ys, xs = np.where(arr[..., 3] > 6)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    p = int(pad * (y1 - y0))
    out = np.zeros((y1 - y0 + 2 * p, x1 - x0 + 2 * p, 4), np.uint8)
    out[p:p + y1 - y0, p:p + x1 - x0] = arr[y0:y1, x0:x1]
    return out

def save(arr, name, height=None):
    im = Image.fromarray(arr, 'RGBA')
    if height: im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    im.save(f'{OUT}/{name}', optimize=True); print(name, im.size)
    return im

# App icon: dark rounded tile on pure black
icon = np.asarray(Image.open(f'{SRC}/datadank-app-icon-original.webp').convert('RGB')).astype(float)
lum = icon.max(-1)
rows = np.where((lum > 6).mean(1) > 0.5)[0]; colsI = np.where((lum > 6).mean(0) > 0.5)[0]
y0, y1, x0, x1 = rows.min(), rows.max() + 1, colsI.min(), colsI.max() + 1
print('tile', x0, y0, x1, y1)
tile = icon[y0:y1, x0:x1]
tilebg = np.median(tile[tile.shape[0] // 2 - 40: tile.shape[0] // 2 + 40, 20:60].reshape(-1, 3), 0); print('tile bg', tilebg)
# corner radius: first row where the tile is "on" at the left edge
edge = (tile.max(-1) > 6)
r = next(i for i in range(tile.shape[0]) if edge[i, 2])
print('corner radius px', r, 'of', tile.shape[0])
# Dark-background mark: D artwork from inside the tile, background removed
inner = unmix(tile, tilebg, 60)
inner[:r, :] = 0; inner[-r:, :] = 0; inner[:, :r] = 0; inner[:, -r:] = 0  # drop tile edge/shadow
save(trim(inner, 0.0), 'datadank-mark-dark.png', 128)
# Square icon, corners filled with tile colour (Apple and maskable icons get masked by the OS)
# Pad to a square with the tile colour so icons are not squashed (the tile is 1082x1061).
side = max(tile.shape[:2]); sq = np.empty((side, side, 3)); sq[:] = tilebg
oy, ox = (side - tile.shape[0]) // 2, (side - tile.shape[1]) // 2
sq[oy:oy + tile.shape[0], ox:ox + tile.shape[1]] = tile
yy, xx = np.mgrid[:sq.shape[0], :sq.shape[1]]
h, w = sq.shape[:2]
cx = np.clip(xx, r, w - 1 - r); cy = np.clip(yy, r, h - 1 - r)
outside = (xx - cx) ** 2 + (yy - cy) ** 2 > r * r
sq[outside] = tilebg
square = Image.fromarray(sq.astype(np.uint8), 'RGB')
# Rounded icon with transparent corners (anti-aliased mask at 4x)
S = 4; big = Image.new('L', (w * S, h * S), 0)
from PIL import ImageDraw
ImageDraw.Draw(big).rounded_rectangle([0, 0, w * S - 1, h * S - 1], radius=r * S, fill=255)
mask = big.resize((w, h), Image.LANCZOS)
rounded = square.convert('RGBA'); rounded.putalpha(mask)
os.makedirs(f'{OUT}/root', exist_ok=True)
for n in (16, 32):
    rounded.resize((n, n), Image.LANCZOS).save(f'{OUT}/root/favicon-{n}x{n}.png', optimize=True)
rounded.save(f'{OUT}/root/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
square.resize((180, 180), Image.LANCZOS).save(f'{OUT}/root/apple-touch-icon.png', optimize=True)
for n in (192, 512):
    rounded.resize((n, n), Image.LANCZOS).save(f'{OUT}/root/icon-{n}.png', optimize=True)
square.resize((512, 512), Image.LANCZOS).save(f'{OUT}/root/icon-maskable-512.png', optimize=True)
rounded.resize((256, 256), Image.LANCZOS).save(f'{OUT}/datadank-app-icon.png', optimize=True)
print('done')
