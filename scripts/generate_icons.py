"""
Generates the app icon, Android adaptive icon layers, splash image and
favicon from simple geometry, so all artwork is original to this project.

    python3 scripts/generate_icons.py      (requires Pillow)

The glyph is an archive box: a lid, a body, and a handle slot cut out of
the body. Everything is drawn at 4x and downsampled for smooth edges.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"
SS = 4  # supersampling factor

ACCENT_TOP = (58, 102, 240)     # gradient start (lighter)
ACCENT_BOTTOM = (36, 73, 209)   # gradient end; mid-tone ~ theme accent #2F5BEA
WHITE = (255, 255, 255)


def glyph_mask(size: int, box: tuple[float, float, float, float]) -> Image.Image:
    """Alpha mask of the archive-box glyph inside `box` (fractions of size)."""
    big = size * SS
    mask = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(mask)
    x0, y0, x1, y1 = (v * big for v in box)
    w, h = x1 - x0, y1 - y0

    def rect(fx0, fy0, fx1, fy1, fr, fill):
        d.rounded_rectangle(
            (x0 + fx0 * w, y0 + fy0 * h, x0 + fx1 * w, y0 + fy1 * h),
            radius=fr * w,
            fill=fill,
        )

    rect(0.00, 0.10, 1.00, 0.32, 0.06, 255)   # lid
    rect(0.07, 0.38, 0.93, 0.92, 0.08, 255)   # body
    rect(0.34, 0.50, 0.66, 0.61, 0.055, 0)    # handle slot (cut out)
    return mask.resize((size, size), Image.LANCZOS)


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(ACCENT_TOP, ACCENT_BOTTOM))
    return img


def rounded_tile(size: int, radius_frac: float) -> Image.Image:
    """Gradient tile with rounded corners on a transparent canvas."""
    big = size * SS
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=radius_frac * big, fill=255)
    tile = gradient(size).convert("RGBA")
    tile.putalpha(mask.resize((size, size), Image.LANCZOS))
    return tile


def with_glyph(base: Image.Image, box, color=WHITE) -> Image.Image:
    layer = Image.new("RGBA", base.size, color + (0,))
    layer.putalpha(glyph_mask(base.size[0], box))
    return Image.alpha_composite(base.convert("RGBA"), layer)


def main() -> None:
    n = 1024
    # Full icon (iOS / store / fallback): full-bleed gradient, glyph ~56%.
    with_glyph(gradient(n), (0.22, 0.20, 0.78, 0.80)).convert("RGB").save(ASSETS / "icon.png")

    # Android adaptive icon: the launcher masks to ~66% safe zone, so the
    # glyph is kept inside the central ~40%.
    clear = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    adaptive_box = (0.31, 0.30, 0.69, 0.70)
    with_glyph(clear, adaptive_box).save(ASSETS / "android-icon-foreground.png")
    gradient(n).save(ASSETS / "android-icon-background.png")
    with_glyph(clear, adaptive_box).save(ASSETS / "android-icon-monochrome.png")  # themed icons use alpha only

    # Splash: rounded tile, shown centred on the theme background colour.
    with_glyph(rounded_tile(n, 0.22), (0.22, 0.20, 0.78, 0.80)).save(ASSETS / "splash-icon.png")

    # Favicon (web).
    with_glyph(rounded_tile(192, 0.22), (0.22, 0.20, 0.78, 0.80)).resize((48, 48), Image.LANCZOS).save(
        ASSETS / "favicon.png"
    )
    print("Wrote icons to", ASSETS)


if __name__ == "__main__":
    main()
