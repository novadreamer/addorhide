"""Generate the AddOrHide icons with a tiny stdlib-only rasterizer.

The icon is a white video screen with a play button on the brand tile, and two badges below it: a green plus
(Add) and a red minus (Hide). `icon-off*.png` is the same picture in grey, shown on the toolbar while the
AddOrHide buttons are disabled.
"""

from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"
SCALE = 8
SIZES = (16, 32, 48, 128)

TILE_START = (91, 91, 240)
TILE_END = (154, 107, 255)
WHITE = (255, 255, 255)
PLAY = (91, 91, 240)
ADD = (31, 157, 85)
HIDE = (217, 58, 73)


def in_rounded_rect(x, y, left, top, right, bottom, radius):
    if x < left or x > right or y < top or y > bottom:
        return False
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def in_triangle(x, y, a, b, c):
    def side(p, q, r):
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
    d1 = side((x, y), a, b)
    d2 = side((x, y), b, c)
    d3 = side((x, y), c, a)
    negative = d1 < 0 or d2 < 0 or d3 < 0
    positive = d1 > 0 or d2 > 0 or d3 > 0
    return not (negative and positive)


def colour_at(u, v, small):
    """Colour of the icon at unit coordinates (u, v), or None for transparent."""
    if not in_rounded_rect(u, v, 0, 0, 1, 1, 0.22):
        return None
    # Badges: green plus (Add) and red minus (Hide), each with a thin white ring so they read on the tile.
    radius = 0.19 if small else 0.165
    for cx, colour, is_plus in ((0.30, ADD, True), (0.70, HIDE, False)):
        cy = 0.74
        distance = (u - cx) ** 2 + (v - cy) ** 2
        if distance <= (radius + 0.035) ** 2:
            if distance > radius ** 2:
                return WHITE
            arm = radius * 0.62
            bar = radius * (0.30 if small else 0.24)
            horizontal = abs(v - cy) <= bar / 2 and abs(u - cx) <= arm
            vertical = is_plus and abs(u - cx) <= bar / 2 and abs(v - cy) <= arm
            return WHITE if horizontal or vertical else colour
    # Video screen with a play button.
    if in_rounded_rect(u, v, 0.15, 0.14, 0.85, 0.58, 0.07):
        if in_triangle(u, v, (0.44, 0.25), (0.44, 0.47), (0.61, 0.36)):
            return PLAY
        return WHITE
    t = (u + v) / 2
    return tuple(round(TILE_START[i] + (TILE_END[i] - TILE_START[i]) * t) for i in range(3))


def grey(colour):
    level = round(0.30 * colour[0] + 0.59 * colour[1] + 0.11 * colour[2])
    level = round(level * 0.75 + 255 * 0.08)
    return (level, level, level)


def draw_icon(size, off=False):
    high = size * SCALE
    small = size <= 16
    output = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            total = [0, 0, 0, 0]
            for sy in range(SCALE):
                for sx in range(SCALE):
                    u = (x * SCALE + sx + 0.5) / high
                    v = (y * SCALE + sy + 0.5) / high
                    colour = colour_at(u, v, small)
                    if colour is None:
                        continue
                    if off:
                        colour = grey(colour)
                    total[0] += colour[0]
                    total[1] += colour[1]
                    total[2] += colour[2]
                    total[3] += 255
            covered = total[3] / 255
            index = (y * size + x) * 4
            if covered:
                output[index:index + 4] = bytes((round(total[0] / covered), round(total[1] / covered),
                                                 round(total[2] / covered), round(total[3] / SCALE / SCALE)))
    return output


def png_bytes(size, rgba):
    raw = b"".join(b"\x00" + bytes(rgba[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main():
    OUT.mkdir(exist_ok=True)
    for size in SIZES:
        (OUT / f"icon{size}.png").write_bytes(png_bytes(size, draw_icon(size)))
        (OUT / f"icon-off{size}.png").write_bytes(png_bytes(size, draw_icon(size, off=True)))
        print(f"icons/icon{size}.png, icons/icon-off{size}.png")


if __name__ == "__main__":
    main()
