# Types Folder

> Cập nhật 2026-07-27: các type hiện có là `Rule`, `Notification`, `ChatMessage`, `RuleScanLog`. Đây là model phía app; Edge Functions vẫn có type nội bộ vì chạy Deno và được kiểm bằng `npm run check:edge`.

## Mục đích

Folder này chứa:
- kiểu dữ liệu (TypeScript types/interfaces)
- cấu trúc dữ liệu dùng trong app

Ví dụ:
- Rule
- Notification
- ChatMessage

---

# Vì sao cần types?

Types giúp:
- giảm bug
- dễ quản lý dữ liệu
- VSCode tự gợi ý code
- dễ scale app

---

# Ví dụ

Rule:

{
  id: "1",
  title: "Shopee - iPhone",
  active: true
}

Notification:

{
  title: "Giảm giá iPhone",
  summary: "AI phát hiện giảm 12%"
}

---

# Tư duy hoạt động

UI
↓
Nhận data đúng structure
↓
Render component

---

# Ví dụ thực tế

RuleCard chỉ nên nhận:

- title
- description
- active

Không nên truyền dữ liệu lung tung.

---

# Những file hiện có

- Rule.ts
- Notification.ts
- ChatMessage.ts
- RuleScanLog.ts

---

# Nguyên tắc

## 1. Tên type phải rõ nghĩa

✅ Rule
✅ Notification

❌ Data1
❌ TestType

---

## 2. Mỗi type chỉ mô tả 1 dữ liệu

Rule chỉ mô tả Rule.

Notification chỉ mô tả Notification.

---

# Mục tiêu

Tạo structure dữ liệu rõ ràng để:
- dễ phát triển app
- dễ kết nối backend
- dễ scale hệ thống

Khi schema ổn định hơn, ưu tiên sinh thêm Supabase database types bằng CLI để type-check tên bảng/cột. Không thay thế các UI model bằng generated type một cách máy móc; map tại ranh giới `lib/` để UI không phụ thuộc trực tiếp toàn bộ schema database.
