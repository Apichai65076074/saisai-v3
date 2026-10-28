# SaiSai image prompts — T06

Created 2026-10-25 with the built-in image generation tool in cyolo1. All images are original generated artwork. No stock images, external logos or in-image text. `transparent_background: true` for all mascot/product calls; `false` for the banner. One generation call per image. The concept PNG was supplied as the image reference for each pose.

## Mascot concept — `mascot/nongsai-concept.webp`

Prompt:

> Create a single isolated 3D mascot concept for SaiSai glass bottle shop, transparent background. Nongsai is a cute squat round clear glass bottle character, amber brown cork stopper, two huge glossy dark eyes, pink cheeks, tiny smiling mouth, small rounded glass arms and feet, several floating air bubbles visible inside. Premium soft studio 3D render, glass cyan #0E7C9B edge reflections, warm friendly appearance. Full body front three-quarter view centered with generous padding, square composition. No text, no letters, no watermark, no other objects. Actual transparent alpha background. This is the master identity reference for four subsequent poses.

## Mascot poses — 512×512 WebP with alpha

Shared prompt prefix (each call references the concept):

> Use case: identity-preserve. Create a single pose variant of the exact Nongsai glass bottle mascot in the reference. Preserve same squat round clear glass body, amber cork, huge dark glossy eyes, pink cheeks, transparent glass limbs, cyan reflections, glass material, lighting and premium 3D render style. Full body square composition, generous padding around whole character and effects, actual transparent background. Pose:

Append the corresponding pose, followed by: `No text, no letters, no numbers, no watermark, no background scene.`

| File | Pose prompt |
|---|---|
| `mascot/nongsai-idle.webp` | Relaxed upright body, arms relaxed, tiny closed smile, eyes open friendly, a few slow floating bubbles. |
| `mascot/nongsai-listening.webp` | Body tilted gently to the right, one small hand cupped beside head, attentive eyes, closed smiling mouth, two cyan curved sound wave arcs beside the head. |
| `mascot/nongsai-thinking.webp` | Eyes looking up toward upper right, one hand under cheek in pondering gesture, closed tiny mouth, bubbles swirling inside body, three small floating round cyan bubbles above head representing thought, no typographic punctuation. |
| `mascot/nongsai-talking.webp` | Lively welcoming speaking pose with both hands gesturing outward, happy open round mouth with visible pink tongue, bright engaged eyes and floating bubbles. |

## Factory banner — `banner-factory-3d.webp`, 1920×800

Prompt:

> Use case: stylized-concept. Website hero banner for SaiSai glass bottle factory, panoramic composition intended crop 1920x800. Premium polished isometric 3D render, contemporary clean factory conveyor with clear transparent, amber brown and emerald green empty glass bottles, soft rounded machinery in glass cyan #0E7C9B and deep navy #0B2E3F, luminous cool studio lighting, lovely glass refraction. All machinery and bottles grouped in RIGHT 60 percent of canvas. LEFT 40 percent is calm pale icy cyan negative space, very minimal, reserved for website text overlay. Camera gently elevated three quarter, sophisticated tactile 3D miniature, no people. No text, no letters, no numbers, no watermark, no logos.

## Product bottles — 512×512 PNG with alpha

Shared prompt prefix:

> Use case: product-mockup. Single empty unbranded glass bottle catalog asset, actual transparent background, square composition. Premium realistic 3D studio render. Front view with tiny view of open threaded rim, camera level, bottle vertically upright centered at x50%, bottom at 90% canvas height. Rounded cylindrical body, rounded shoulders, short threaded neck, no cap. Soft large studio light upper left, slim cyan reflections, realistic glass wall thickness, no labels, no letters, no numbers, no watermark, no props, no floor. Same camera and lighting across the series.

Each call appends:

> This bottle: {ml} ml, {color} glass. Bottle occupies {height}% of canvas height to preserve relative catalog size (100ml smallest, 500ml largest). Bottle body height to width ratio about 2.1, neck opening wider in larger bottles.

| Public file | ml | color | height |
|---|---:|---|---:|
| `/assets/bottle-b100-clear.png` | 100 | colorless transparent | 48 |
| `/assets/bottle-b100-amber.png` | 100 | amber brown | 48 |
| `/assets/bottle-b150-clear.png` | 150 | colorless transparent | 56 |
| `/assets/bottle-b150-amber.png` | 150 | amber brown | 56 |
| `/assets/bottle-b250-clear.png` | 250 | colorless transparent | 66 |
| `/assets/bottle-b250-amber.png` | 250 | amber brown | 66 |
| `/assets/bottle-b250-green.png` | 250 | emerald green | 66 |
| `/assets/bottle-b500-clear.png` | 500 | colorless transparent | 82 |
| `/assets/bottle-b500-amber.png` | 500 | amber brown | 82 |

## Post-processing and validation

Pillow 12.2.0; see `process_images.py`. Generated PNG originals supply real alpha; no white/color key replacement is used, preserving transparent glass edges. Trim empty alpha bounds (for bottle alignment, ignore near-invisible specks with alpha ≤ 16 when computing the crop), resize with LANCZOS, composite on a transparent 512×512 RGBA canvas. Mascots fit within 460×460; bottle heights are normalized to 246 / 287 / 338 / 420 pixels for 100 / 150 / 250 / 500 ml, centered horizontally with shared baseline y=461. These are catalog illustrations, not dimensional engineering drawings.

Banner: centered `ImageOps.fit` to 1920×800, WebP quality 88. Mascots: WebP quality 90. Product PNGs: lossless optimized RGBA. Final files have no text overlays. Run `python3 web/public/img/validate_images.py` from repository root to check paths, exact dimensions, RGBA/alpha corners for cutouts, and total image size ≤ 8,000,000 bytes. Opaque banner may decode as RGB because WebP drops an unused fully opaque alpha channel.


## Final verification

Visual review: all five mascot images share the same character; listening has sound waves, thinking looks upward with thought bubbles, talking has an open mouth. Bottle colors and relative sizes match the nine product slugs. Factory banner leaves the left side clear for copy. No text or logos observed.

`python3 web/public/img/validate_images.py`: all 15 files PASS.

Independent `python3 -c` Pillow check:

```text
PASS 15 files: 14 RGBA 512x512, all corner alpha=0; banner 1920x800; 1,121,499 bytes <= 8 MB
```

Generation/post-processing/visual inspection/validation completed in approximately 10 minutes, within the 3-hour target. No GPU rental or application services were used. Only T06-owned asset paths were changed. Original generation intermediates are excluded from the public directory and git.
