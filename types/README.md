# Types Folder

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

# Những file dự kiến

- Rule.ts
- Notification.ts
- ChatMessage.ts

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