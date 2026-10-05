"""Generates the desktop installer resources in build/ from Vale's brand art.

    python3 build/make-resources.py

Outputs (committed, so packaging needs no Python):
  icon.png                 1024x1024 app icon (macOS / Linux), Apple-grid padding
  icon.ico                 16-256 px Windows icon (tighter crop for small sizes)
  installerSidebar.bmp     164x314 NSIS welcome/finish page art (24-bit)
  uninstallerSidebar.bmp   164x314 NSIS uninstaller art (24-bit)
  installerHeader.bmp      150x57 NSIS page header art (24-bit)
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'build'
ICON_SRC = ROOT / 'public' / 'icons' / 'icon-512.png'
LOGO_SRC = ROOT / 'public' / 'brand' / 'vale-logo.png'
SPLASH_SRC = ROOT / 'public' / 'brand' / 'vale-splash.png'

BG = (5, 9, 11)
TEAL = (33, 255, 214)


def rounded_mask(size, box, radius, scale=4):
    """Anti-aliased rounded-rectangle mask."""
    big = Image.new('L', (size[0] * scale, size[1] * scale), 0)
    ImageDraw.Draw(big).rounded_rectangle([c * scale for c in box], radius=radius * scale, fill=255)
    return big.resize(size, Image.LANCZOS)


def app_icon(size, inset, radius):
    """The Vale V on its dark tile, clipped to a rounded square."""
    src = Image.open(ICON_SRC).convert('RGBA')
    body = size - 2 * inset
    tile = src.resize((body, body), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    if inset:
        # Soft drop shadow under the tile (macOS-style).
        shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        smask = rounded_mask((size, size), (inset, inset + size * 0.012, size - inset, size - inset + size * 0.012), radius)
        shadow.putalpha(smask.point(lambda a: int(a * 0.55)))
        canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(size * 0.018)))

    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    layer.paste(tile, (inset, inset))
    mask = rounded_mask((size, size), (inset, inset, size - inset, size - inset), radius)
    layer.putalpha(ImageChops.multiply(layer.getchannel('A'), mask))
    canvas = Image.alpha_composite(canvas, layer)

    # Faint teal rim so the tile reads on dark taskbars and docks.
    rim = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    width = max(1, round(size * 0.004))
    ImageDraw.Draw(rim).rounded_rectangle(
        (inset + width / 2, inset + width / 2, size - inset - width / 2, size - inset - width / 2),
        radius=radius,
        outline=TEAL + (70,),
        width=width,
    )
    return Image.alpha_composite(canvas, rim)


def sidebar(dim=1.0):
    """164x314 portrait art: the splash key art fading into Vale's background."""
    w, h = 164, 314
    out = Image.new('RGB', (w, h), BG)
    # Vertical glow behind the art.
    glow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(glow).ellipse((-60, 40, w + 60, 240), fill=60)
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    out = Image.composite(Image.new('RGB', (w, h), (12, 70, 62)), out, glow)

    art = Image.open(SPLASH_SRC).convert('RGB').resize((w + 40, w + 40), Image.LANCZOS)
    art = art.crop((20, 6, w + 20, w + 40))  # trim sides, keep the floor grid
    fade = Image.new('L', art.size, 255)
    draw = ImageDraw.Draw(fade)
    fh = 28
    for y in range(fh):
        a = int(255 * (y / fh))
        draw.line([(0, y), (art.width, y)], fill=a)
        draw.line([(0, art.height - 1 - y), (art.width, art.height - 1 - y)], fill=a)
    top = 58
    out.paste(art, (0, top), fade)

    # Floor lines continuing the splash's grid towards the bottom edge.
    lines = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    horizon = top + art.height - 10
    for i, y in enumerate(range(horizon + 8, h, 14)):
        ld.line([(0, y), (w, y)], fill=TEAL + (max(8, 34 - i * 4),), width=1)
    for x in range(-200, w + 200, 34):
        ld.line([(w / 2 + (x - w / 2) * 0.25, horizon), (x, h)], fill=TEAL + (22,), width=1)
    out = Image.alpha_composite(out.convert('RGBA'), lines).convert('RGB')

    if dim != 1.0:
        out = ImageEnhance.Brightness(ImageEnhance.Color(out).enhance(0.6)).enhance(dim)
    return out


def header():
    """150x57 header art (MUI_HEADERIMAGE_RIGHT): the V on the header's light background."""
    w, h = 150, 57
    out = Image.new('RGB', (w, h), (255, 255, 255))
    logo = Image.open(LOGO_SRC).convert('RGBA')
    lh = 39
    lw = round(logo.width * lh / logo.height)
    logo = logo.resize((lw, lh), Image.LANCZOS)
    # Darken the glow slightly so the teal holds up on white.
    r, g, b, a = logo.split()
    logo = Image.merge('RGBA', (r.point(lambda v: int(v * 0.72)), g.point(lambda v: int(v * 0.78)), b.point(lambda v: int(v * 0.74)), a))
    out.paste(logo, (w - lw - 12, (h - lh) // 2), logo)
    return out


def main():
    OUT.mkdir(exist_ok=True)

    # macOS / Linux: Apple's 1024 grid keeps the tile at 824 px with ~185 px corners.
    app_icon(1024, 100, 185).save(OUT / 'icon.png')

    # Windows: fuller tile; small sizes are rendered from scratch for sharpness.
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [app_icon(s, 0 if s <= 32 else round(s * 0.03), round(s * 0.2)) for s in ico_sizes]
    frames[-1].save(OUT / 'icon.ico', format='ICO', sizes=[(s, s) for s in ico_sizes], append_images=frames[:-1])

    sidebar().save(OUT / 'installerSidebar.bmp')
    sidebar(dim=0.8).save(OUT / 'uninstallerSidebar.bmp')
    header().save(OUT / 'installerHeader.bmp')
    print('wrote', ', '.join(p.name for p in sorted(OUT.iterdir()) if p.suffix in {'.png', '.ico', '.bmp'}))


if __name__ == '__main__':
    main()
