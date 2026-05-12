# Components Folder

## Mục đích

Folder này chứa:
- các UI component tái sử dụng trong app
- các khối giao diện nhỏ được ghép lại thành màn hình lớn

Ví dụ:
- Card
- Button
- Notification Item
- Chat Bubble

---

# Tư duy hoạt động

App sẽ được xây theo kiểu:

Screen
↓
Ghép nhiều Component nhỏ
↓
Tạo thành giao diện hoàn chỉnh

Ví dụ:

Home Screen
├── StatsCard
├── RuleCard
├── AIInsightBox
└── PrimaryButton

---

# Nguyên tắc khi tạo component

## 1. Mỗi component chỉ nên có 1 nhiệm vụ

Ví dụ:

StatsCard:
- chỉ hiển thị thống kê

RuleCard:
- chỉ hiển thị thông tin rule

Không nên:
- vừa hiển thị UI
- vừa xử lý quá nhiều logic

---

## 2. Component phải tái sử dụng được

Ví dụ:

RuleCard có thể dùng ở:
- Home Screen
- Rules Screen

---

## 3. Không code toàn bộ UI trong Screen

❌ Sai:

index.tsx dài 2000 dòng

✅ Đúng:

index.tsx chỉ ghép component:

<StatsCard />
<RuleCard />
<Button />

---

# Cấu trúc component chuẩn

Ví dụ:

RuleCard.tsx

1. Comment đầu file
2. Import thư viện
3. Khai báo Props
4. Tạo component
5. Tạo styles

---

# Ví dụ cấu trúc

/*
  File: RuleCard.tsx

  Chức năng:
  - Hiển thị thông tin rule
  - Dùng ở Home Screen và Rules Screen
*/

import ...
type Props ...
export default function ...
const styles ...

---

# Quy tắc đặt tên

## File component:
- PascalCase

Ví dụ:
- StatsCard.tsx
- RuleCard.tsx

---

## Tên component:
- giống tên file

Ví dụ:

export default function StatsCard()

---

# Những component dự kiến của app

## Home
- StatsCard
- RuleCard
- AIInsightBox
- PrimaryButton

---

## Notifications
- NotificationCard

---

## AI Chat
- ChatBubble
- ChatInput

---

# Mục tiêu cuối cùng

Tách UI thành component nhỏ để:
- dễ đọc code
- dễ sửa
- dễ tái sử dụng
- dễ nâng cấp
- dễ nhờ AI hỗ trợ code