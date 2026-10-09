"""Generate the AddOrHide extension icons with a tiny stdlib-only rasterizer."""

from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"
SCALE = 4


def rounded_square(x, y, size, radius):
    """Return whether a point is inside a rounded square."""
    left = radius
    right = size - radius
    top = radius
    bottom = size - radius
    if left <= x <= right or top <= y <= bottom:
        return 0 <= x <= size and 0 <= y <= size
    cx = left if x < left else right
    cy = top if y < top else bottom
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def blend_gradient(x, y, size):
    t = max(0.0, min(1.0, (x + y) / (2 * size)))
    start = (91, 91, 240)
    end = (154, 107, 255)
    return tuple(round(start[i] + (end[i] - start[i]) * t) for i in range(3))


def draw_icon(size):
    high = size * SCALE
    radius = size * 0.22 * SCALE
    pixels = bytearray(high * high * 4)
    plus_length = size * 0.52 * SCALE
    plus_thickness = size * 0.12 * SCALE
    center = high / 2

    for y in range(high):
        for x in range(high):
            inside = rounded_square(x + 0.5, y + 0.5, high, radius)
            if not inside:
                continue
            r, g, b = blend_gradient(x + 0.5, y + 0.5, high)
            half_length = plus_length / 2
            half_thickness = plus_thickness / 2
            in_horizontal = abs(y + 0.5 - center) <= half_thickness and abs(x + 0.5 - center) <= half_length
            in_vertical = abs(x + 0.5 - center) <= half_thickness and abs(y + 0.5 - center) <= half_length
            if in_horizontal or in_vertical:
                r, g, b = 255, 255, 255
            index = (y * high + x) * 4
            pixels[index:index + 4] = bytes((r, g, b, 255))

    output = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            samples = []
            for sy in range(SCALE):
                for sx in range(SCALE):
                    index = (((y * SCALE + sy) * high) + (x * SCALE + sx)) * 4
                    samples.append(pixels[index:index + 4])
            index = (y * size + x) * 4
            output[index:index + 4] = bytes(sum(sample[channel] for sample in samples) // len(samples)
                                            for channel in range(4))
    return bytes(output)


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)


def write_png(path, size, rgba):
    rows = b"".join(b"\x00" + rgba[row * size * 4:(row + 1) * size * 4] for row in range(size))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header)
    png += png_chunk(b"IDAT", zlib.compress(rows, 9)) + png_chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(OUT / f"icon{size}.png", size, draw_icon(size))


if __name__ == "__main__":
    main()
