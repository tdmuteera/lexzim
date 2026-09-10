"""Generate LexZim home-screen / PWA icons."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (32, 36, 44)
GOLD = (160, 124, 56)
INNER = (40, 44, 54)


def make(size: int, path: Path) -> None:
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)
    m = max(2, int(size * 0.08))
    draw.rounded_rectangle(
        [m, m, size - m, size - m],
        radius=int(size * 0.18),
        outline=GOLD,
        width=max(2, size // 48),
    )
    m2 = max(4, int(size * 0.14))
    draw.rounded_rectangle(
        [m2, m2, size - m2, size - m2],
        radius=int(size * 0.14),
        fill=INNER,
        outline=GOLD,
        width=max(1, size // 64),
    )
    text = "LZ"
    font_size = max(12, int(size * 0.42))
    font = None
    for candidate in (
        r"C:\Windows\Fonts\georgia.ttf",
        r"C:\Windows\Fonts\times.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ):
        try:
            font = ImageFont.truetype(candidate, font_size)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.02
    draw.text((x, y), text, fill=GOLD, font=font)
    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


def main() -> None:
    for size in (32, 180, 192, 512):
        make(size, OUT / f"icon-{size}.png")


if __name__ == "__main__":
    main()
