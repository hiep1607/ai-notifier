"""Chốt icon tông VIBRANT (rực rỡ, trẻ trung): áp cho icon.png + adaptive-icon.png.
Chạy SAU crop_icon.py (để icon.png/adaptive-icon.png đang ở màu gốc)."""
from PIL import Image, ImageEnhance
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "images")

def vibrant(rgb):
    v = ImageEnhance.Color(rgb).enhance(1.45)
    v = ImageEnhance.Brightness(v).enhance(1.04)
    v = ImageEnhance.Contrast(v).enhance(1.03)
    return v

# icon.png (nền trắng)
icon = Image.open(os.path.join(OUT, "icon.png")).convert("RGB")
vibrant(icon).save(os.path.join(OUT, "icon.png"))

# adaptive-icon.png (giữ alpha trong suốt)
ad = Image.open(os.path.join(OUT, "adaptive-icon.png")).convert("RGBA")
r, g, b, a = ad.split()
vr, vg, vb = vibrant(Image.merge("RGB", (r, g, b))).split()
Image.merge("RGBA", (vr, vg, vb, a)).save(os.path.join(OUT, "adaptive-icon.png"))

print("done: icon.png + adaptive-icon.png (vibrant)")
