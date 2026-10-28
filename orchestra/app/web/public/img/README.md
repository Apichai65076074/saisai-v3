# SaiSai generated image assets (T06)

All 15 images were created with the built-in image generation tool in the cyolo1 session. No external stock imagery or real logos are used. See [PROMPTS.md](PROMPTS.md) for generation prompts and processing details.

- Mascot fallback: `/img/mascot/nongsai-{concept,idle,listening,thinking,talking}.webp`, 512×512, alpha.
- Hero fallback: `/img/banner-factory-3d.webp`, 1920×800.
- Product catalog: `/assets/bottle-<slug>.png`, 512×512, alpha; the nine slugs match the product contract.

Validate from the repository root:

```sh
python3 web/public/img/validate_images.py
```

The validator checks all filenames, dimensions, alpha corners, nonempty alpha content and combined size ≤ 8,000,000 bytes. These static assets require no services or GPU. Web build and browser cases belong to the integrating UI workers.
