"""Cắt cái chuông từ logo Nofy gốc (bỏ chữ 'Nofy'), căn giữa thành icon vuông.
Tự dò vùng nội dung: chuông là cụm trên, chữ là cụm dưới → cắt theo cụm trên."""
from PIL import Image
import os

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "assets", "images")
SRC = os.path.join(OUT, "nofy-soure.png")

img = Image.open(SRC).convert("RGB")
W, H = img.size
bg = img.getpixel((4, 4))                       # màu nền (gần trắng)

# nhị phân: pixel khác nền = nội dung
gray = img.convert("L")
binimg = gray.point(lambda p: 255 if p < 244 else 0)

# các hàng có nội dung
rows = [binimg.crop((0, y, W, y + 1)).getbbox() is not None for y in range(H)]

# gom thành các "băng" liên tục; gộp khe trống nhỏ (<10px) để chuông không bị tách
bands = []
start = None
gap = 0
for y, has in enumerate(rows):
    if has:
        if start is None:
            start = y
        gap = 0
        end = y
    elif start is not None:
        gap += 1
        if gap > 10:
            bands.append((start, end + 1))
            start = None
if start is not None:
    bands.append((start, end + 1))

b0, b1 = bands[0]                               # cụm trên cùng = chuông + sparkle + chấm đỏ

# viền ngang của cụm chuông
band = binimg.crop((0, b0, W, b1))
lx, ly, rx, ry = band.getbbox()
left, top, right, bottom = lx, b0 + ly, rx, b0 + ry
crop = img.crop((left, top, right, bottom))
cw, ch = crop.size
content = max(cw, ch)

def square(pad_frac, mode, fill):
    size = int(content / (1 - 2 * pad_frac))
    canvas = Image.new(mode, (size, size), fill)
    layer = crop.convert(mode)
    canvas.paste(layer, ((size - cw) // 2, (size - ch) // 2))
    return canvas.resize((1024, 1024), Image.LANCZOS)

# icon.png — nền màu gốc (đặc, chuẩn iOS/launcher), padding 12%
square(0.12, "RGB", bg).save(os.path.join(OUT, "icon.png"))

# adaptive-icon.png — vùng an toàn (padding 22%), nền trong suốt; backgroundColor đặt = bg
square(0.22, "RGBA", (0, 0, 0, 0)).save(os.path.join(OUT, "adaptive-icon.png"))

print("bg =", "#%02x%02x%02x" % bg)
print("crop box =", (left, top, right, bottom), "size", crop.size)
print("done: icon.png, adaptive-icon.png")
