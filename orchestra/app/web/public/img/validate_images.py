"""Run from repository root: python3 web/public/img/validate_images.py."""
from pathlib import Path
from PIL import Image

root = Path('web/public')
mascots = [root / f'img/mascot/nongsai-{s}.webp' for s in ['concept', 'idle', 'listening', 'thinking', 'talking']]
bottles = [root / f'assets/bottle-{s}.png' for s in ['b100-clear', 'b100-amber', 'b150-clear', 'b150-amber', 'b250-clear', 'b250-amber', 'b250-green', 'b500-clear', 'b500-amber']]
files = mascots + bottles + [root / 'img/banner-factory-3d.webp']
for path in files:
    with Image.open(path) as im:
        expected = (1920, 800) if path == files[-1] else (512, 512)
        assert im.size == expected, (path, im.size)
        if path != files[-1]:
            assert im.mode == 'RGBA', (path, im.mode)
            assert all(im.getpixel(p)[3] == 0 for p in [(0,0), (511,0), (0,511), (511,511)]), path
            assert im.getchannel('A').getextrema() == (0,255), path
        print(f'PASS {path.name}: {im.size}, {im.mode}' + (', corner alpha=0' if path != files[-1] else ''))
total = sum(p.stat().st_size for p in files)
assert total <= 8_000_000, total
print(f'PASS {len(files)} images; total {total:,} bytes <= 8,000,000')
