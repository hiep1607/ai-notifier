"""Chốt icon tông COOL (tím -> cyan): áp cho icon.png + adaptive-icon.png, dọn file preview."""
from PIL import Image
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "images")

def cool(rgb):
    h, s, v = rgb.convert("HSV").split()
    h = h.point(lambda p: (p - 12) % 256)
    s = s.point(lambda p: min(255, int(p * 1.28)))
    return Image.merge("HSV", (h, s, v)).convert("RGB")

# icon.png (nền trắng)
icon = Image.open(os.path.join(OUT, "icon.png")).convert("RGB")
cool(icon).save(os.path.join(OUT, "icon.png"))

# adaptive-icon.png (giữ alpha trong suốt)
ad = Image.open(os.path.join(OUT, "adaptive-icon.png")).convert("RGBA")
r, g, b, a = ad.split()
cr, cg, cb = cool(Image.merge("RGB", (r, g, b))).split()
Image.merge("RGBA", (cr, cg, cb, a)).save(os.path.join(OUT, "adaptive-icon.png"))

# dọn file preview
for f in ["icon_vibrant.png", "icon_candy.png", "icon_cool.png"]:
    p = os.path.join(OUT, f)
    if os.path.exists(p):
        os.remove(p)

print("done: icon.png + adaptive-icon.png (cool), cleaned previews")
