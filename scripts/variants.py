"""Tạo vài biến thể màu TRẺ TRUNG từ icon Nofy đã cắt (icon.png)."""
from PIL import Image, ImageEnhance
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "images")
im = Image.open(os.path.join(OUT, "icon.png")).convert("RGB")

# 1) Vibrant — tăng độ rực + sáng nhẹ
v = ImageEnhance.Color(im).enhance(1.45)
v = ImageEnhance.Brightness(v).enhance(1.04)
v = ImageEnhance.Contrast(v).enhance(1.03)
v.save(os.path.join(OUT, "icon_vibrant.png"))

# 2) Candy — dịch tông sang hồng-tím-xanh kẹo ngọt, rực hơn
hsv = im.convert("HSV")
h, s, vch = hsv.split()
h = h.point(lambda p: (p + 14) % 256)
s = s.point(lambda p: min(255, int(p * 1.3)))
candy = Image.merge("HSV", (h, s, vch)).convert("RGB")
candy.save(os.path.join(OUT, "icon_candy.png"))

# 3) Cool — dịch sang xanh dương - cyan tươi mát
h2 = hsv.split()[0].point(lambda p: (p - 12) % 256)
s2 = hsv.split()[1].point(lambda p: min(255, int(p * 1.28)))
cool = Image.merge("HSV", (h2, s2, vch)).convert("RGB")
cool.save(os.path.join(OUT, "icon_cool.png"))

print("done: icon_vibrant.png, icon_candy.png, icon_cool.png")
