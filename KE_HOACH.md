# Kế hoạch & Tiến độ — AI Notifier

> File này theo dõi: kiến trúc, việc ĐÃ LÀM, việc CẦN LÀM. Cập nhật sau mỗi task.
> Cập nhật lần cuối: 2026-06-19 (trigger "thay đổi")

## Mục tiêu sản phẩm
Người dùng mô tả bằng ngôn ngữ tự nhiên → AI tạo **rule** → hệ thống **tự quét tin thật nhiều nguồn 24/7** → gửi **thông báo** đúng chủ đề/điều kiện, kèm link bài gốc.

## Kiến trúc hiện tại
```
App Expo (web + mobile)
   │  invoke
   ▼
Supabase Edge Functions ──► Gemini API (Google Search grounding)
   ├─ generate-rule : NL → Rule (hỏi lại khi thiếu, không bịa)
   └─ run-monitor   : tìm tin thật → lọc điều kiện → insert notifications → gửi push
   ▲
pg_cron (mỗi 15 phút) → run-monitor (quét nền, lọc rule tới hạn theo lịch)
```
- AI: **Gemini server-side** (key trong Supabase secret), KHÔNG còn Ollama local.
- Project ref: `idtibfiyfywcugdvlqal`. Deploy: `npx supabase functions deploy <fn> --project-ref idtibfiyfywcugdvlqal`.
- Quy ước hội thoại: câu mở đầu `!` = toàn quyền, không hỏi lại. Việc gì tự làm được thì tự làm.

---

## ✅ ĐÃ LÀM
- [x] Pipeline tin THẬT đa nguồn bằng Gemini + Google Search grounding.
- [x] Chuyển AI lên server (Edge Functions), bỏ Ollama; key giấu trong secret.
- [x] Chạy nền 24/7 bằng pg_cron (mỗi 15 phút).
- [x] Thông báo **theo điều kiện**: rule có `condition` chỉ báo khi bài thỏa.
- [x] Thông báo **chi tiết hơn**: `content` đầy đủ + mục `details` (phân tích sâu).
- [x] Mỗi lần quét 1 rule **chỉ 1 thông báo** (MAX_PER_RUN = 1).
- [x] **Tần suất linh hoạt**: lưu số phút, tối thiểu 30 phút; "Theo điều kiện" quét 15 phút (ẩn).
- [x] **Đặt giờ cụ thể** (`run_at`, giờ VN): vd "Hằng ngày lúc 08:00".
- [x] Tạo rule **chặt chẽ**: thiếu info thì hỏi, yêu cầu vô lý thì giải thích.
- [x] **Sắp xếp rule** theo thời gian tạo (cũ → mới) ở Home + Rules.
- [x] **Push notification** (code): đăng ký token, gửi Expo Push từ run-monitor, bảng push_tokens.
- [x] Deploy generate-rule + run-monitor; cron đã bật.
- [x] **Tối ưu quota Gemini**: cron là bộ lập lịch DUY NHẤT (lọc `isDue` theo `last_run_at`+tần suất); Home không quét trùng nữa (chỉ đọc tin); refresh thủ công throttle 5'; client retry lỗi tạm (không retry 429); server gặp 429/503 thì DỪNG sớm (giữ `last_run_at` để quét lại) + trần 8 rule/lần.
- [x] **Trigger "thay đổi"**: lưu `last_value` mỗi rule; truyền giá trị lần trước vào Gemini để chấm `changed`/`matches_condition`; rule "theo điều kiện" chỉ báo khi số liệu THỰC SỰ đổi so với lần trước (migration 0008).

## ⏳ ĐANG CHỜ NGƯỜI DÙNG (tôi không tự làm được)
- [ ] **Chạy SQL** gộp (`run_at` + `push_tokens`) trong Supabase SQL Editor — tôi không có mật khẩu DB.
- [ ] **Đổi key Gemini** — key cũ đã lộ trong ảnh chụp lúc setup (bảo mật).
- [ ] **EAS init + dev build** để nhận push thật trên điện thoại (cần tài khoản Expo + thiết bị; build cloud tính phí).

## 📋 CẦN LÀM TIẾP (backlog, ưu tiên trên xuống)
- [ ] **Phân quyền run-monitor theo user** (hiện ai đăng nhập cũng kích hoạt được).
- [ ] **Tách nhiều rule từ 1 câu** ("theo dõi vàng và bitcoin" → 2 rule).
- [ ] **Polish UI/UX**: lọc/tìm thông báo, trạng thái rỗng, hiển thị điều kiện/lịch rõ hơn.

---

## Nhật ký thay đổi
- 2026-06-19: Trigger "thay đổi" — lưu last_value, so sánh với lần trước để chỉ báo khi số liệu thực sự đổi (migration 0008). Deploy lại run-monitor.
- 2026-06-19: Tối ưu quota Gemini — bỏ quét trùng ở Home (cron là lịch duy nhất), client retry lỗi tạm, server dừng sớm khi 429 + trần 8 rule/lần. Deploy lại run-monitor.
- 2026-06-19: Tạo file kế hoạch. Hoàn tất push notification (code) + deploy 2 function.
- 2026-06-19: Đặt giờ cụ thể (run_at) + sắp xếp rule theo created_at.
- 2026-06-19: Tần suất linh hoạt (số phút, min 30) + ẩn 15 phút cho "Theo điều kiện".
- 2026-06-19: Tạo rule chặt chẽ (hỏi lại / giải thích yêu cầu vô lý).
- 2026-06-19: Thông báo chi tiết + 1/lần + lịch per-rule (last_run_at, cron 15 phút).
- 2026-06-19: Chuyển AI sang Gemini server-side + pg_cron 24/7 (bỏ Ollama).
