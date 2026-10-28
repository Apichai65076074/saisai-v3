"""Resize generated originals listed in a local JSON manifest. Pillow only; no redraw."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

manifest = json.loads(Path(sys.argv[1]).read_text())
root = Path('web/public')
for key, source in manifest.items():
    im = Image.open(source).convert('RGBA')
    if key == 'banner':
        im = ImageOps.fit(im, (1920, 800), method=Image.Resampling.LANCZOS)
        im.save(root / 'img/banner-factory-3d.webp', quality=88, method=4)
        continue
    # Trim only empty outer alpha, preserving translucency and generated edges.
    # Ignore near-invisible alpha specks when aligning catalog silhouettes.
    alpha = im.getchannel('A')
    bbox = (alpha.point(lambda a: 255 if a > 16 else 0) if key.startswith('b') else alpha).getbbox()
    assert bbox, key
    im = im.crop(bbox)
    if key.startswith('b'):
        ml = int(key.split('-')[0][1:])
        height = {100:246,150:287,250:338,500:420}[ml]
        im = ImageOps.contain(im, (380, height), Image.Resampling.LANCZOS)
        x, y = (512-im.width)//2, 461-im.height
        target = root / f'assets/bottle-{key}.png'
    else:
        im = ImageOps.contain(im, (460, 460), Image.Resampling.LANCZOS)
        x, y = (512-im.width)//2, (512-im.height)//2
        target = root / f'img/mascot/nongsai-{key}.webp'
    canvas = Image.new('RGBA', (512,512))
    canvas.alpha_composite(im, (x,y))
    if target.suffix == '.webp':
        canvas.save(target, quality=90, method=4)
    else:
        canvas.save(target, optimize=True)
    print(target)
