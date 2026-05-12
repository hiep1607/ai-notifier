# Data Folder

## Mục đích

Folder này chứa:
- dữ liệu giả lập (mock data)
- dữ liệu dùng để test giao diện
- dữ liệu tạm thời khi chưa có backend

---

# Vì sao cần folder này?

Hiện tại app chưa có:
- database
- API
- backend thật

Nên cần fake data để:
- hiển thị UI
- test component
- build flow app

---

# Tư duy hoạt động

Hiện tại:

UI
↓
Lấy dữ liệu từ mock data
↓
Render giao diện

Sau này:

UI
↓
Lấy dữ liệu từ backend/API
↓
Render giao diện

---

# Những file dự kiến

## mockRules.ts

Chứa:
- danh sách Rule giả

Ví dụ:
- Shopee - iPhone
- Tin tức AI
- HaUI Deadline

---

## mockNotifications.ts

Chứa:
- danh sách notification giả

Ví dụ:
- Giảm giá iPhone
- Có tin tức AI mới

---

## mockChatMessages.ts

Chứa:
- dữ liệu chat AI giả lập

Ví dụ:
- AI hỏi
- User trả lời

---

# Quy tắc

## 1. Không viết UI ở đây

Folder này chỉ chứa:
- dữ liệu

Không chứa:
- component
- styles
- screen

---

## 2. Dữ liệu phải đúng structure

Ví dụ:

Rule phải đúng type Rule.

Notification phải đúng type Notification.

---

## 3. Tên dữ liệu phải rõ nghĩa

✅ mockRules
✅ mockNotifications

❌ data1
❌ test123

---

# Ví dụ structure

Rule:

{
  id: "1",
  title: "Shopee - iPhone",
  active: true
}

---

Notification:

{
  id: "1",
  title: "Giảm giá iPhone",
  summary: "AI phát hiện giảm 12%"
}

---

# Mục tiêu

Tách dữ liệu khỏi giao diện để:
- dễ test UI
- dễ sửa
- dễ thay backend thật sau này
- dễ scale app