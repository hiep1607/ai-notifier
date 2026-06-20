"""Vẽ icon Nofy (chuông gradient + người + chấm đỏ + sparkle) bằng Pillow.
Xuất: assets/images/icon.png (nền trắng) + assets/images/adaptive-icon.png (nền trong suốt, thu nhỏ vùng an toàn)."""
from PIL import Image, ImageDraw
import os

SS = 3                      # supersample cho viền mượt
W = 1024 * SS
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "images")

def s(v):
    return int(round(v * SS))

# ---------- gradient tím -> xanh (chéo) ----------
G = 512
small = Image.new("RGBA", (G, G))
px = small.load()
c1 = (158, 76, 240)   # tím (góc trên-trái)
c2 = (56, 150, 255)   # xanh (góc dưới-phải)
for y in range(G):
    for x in range(G):
        t = (x + y) / (2 * (G - 1))
        px[x, y] = (
            int(c1[0] + (c2[0] - c1[0]) * t),
            int(c1[1] + (c2[1] - c1[1]) * t),
            int(c1[2] + (c2[2] - c1[2]) * t),
            255,
        )
grad = small.resize((W, W), Image.BILINEAR)

# ---------- mask hình chuông ----------
mask = Image.new("L", (W, W), 0)
md = ImageDraw.Draw(mask)
md.ellipse([s(352), s(250), s(672), s(580)], fill=255)                               # vòm trên
md.polygon([(s(372), s(460)), (s(652), s(460)), (s(752), s(690)), (s(272), s(690))], fill=255)  # loe dưới
md.rounded_rectangle([s(250), s(668), s(774), s(712)], radius=s(22), fill=255)        # vành đáy
md.ellipse([s(512 - 34), s(206), s(512 + 34), s(276)], fill=255)                      # núm trên
md.ellipse([s(512 - 46), s(726), s(512 + 46), s(820)], fill=255)                      # quả lắc

# ---------- ghép gradient theo mask ----------
layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
layer.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(layer)
WHITE = (255, 255, 255, 255)

# ---------- người ở giữa chuông ----------
d.ellipse([s(512 - 60), s(372), s(512 + 60), s(492)], fill=WHITE)                     # đầu
d.pieslice([s(512 - 118), s(500), s(512 + 118), s(672)], start=180, end=360, fill=WHITE)  # vai

# ---------- chấm đỏ + viền trắng (góc trên-phải) ----------
d.ellipse([s(705 - 84), s(285 - 84), s(705 + 84), s(285 + 84)], fill=WHITE)
d.ellipse([s(705 - 62), s(285 - 62), s(705 + 62), s(285 + 62)], fill=(255, 62, 95, 255))

# ---------- sparkle (ngôi sao 4 cánh) ----------
def sparkle(cx, cy, r, col=WHITE):
    w = r * 0.30
    pts = [(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
           (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)]
    d.polygon([(s(a), s(b)) for a, b in pts], fill=col)

SPARK = (170, 110, 242, 255)   # tím để nổi trên nền trắng
sparkle(782, 150, 48, SPARK)
sparkle(854, 214, 26, SPARK)

# ---------- xuất ----------
elems = layer.resize((1024, 1024), Image.LANCZOS)

# icon.png — nền trắng, RGB (chuẩn iOS/launcher)
icon = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
icon = Image.alpha_composite(icon, elems)
icon.convert("RGB").save(os.path.join(OUT, "icon.png"))

# adaptive-icon.png — nền trong suốt, thu 0.72 vào vùng an toàn (Android bo tròn không cắt mất)
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
sc = elems.resize((int(1024 * 0.72), int(1024 * 0.72)), Image.LANCZOS)
off = (1024 - sc.width) // 2
fg.paste(sc, (off, off), sc)
fg.save(os.path.join(OUT, "adaptive-icon.png"))

print("done: icon.png, adaptive-icon.png")
