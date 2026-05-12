/*
  File: mockNotifications.ts

  Chức năng:
  - Chứa danh sách Notification giả
  - Dùng để test UI
  - Dùng cho:
    + Notifications Screen
*/

import { Notification } from "@/types/Notification";

/*
  mockNotifications:
  dữ liệu notification giả lập
*/

export const mockNotifications: Notification[] = [
  {
    id: "1",

    title: "📱 Giảm giá iPhone 15",

    summary:
      "AI phát hiện giá giảm 12% so với hôm qua.",

    time: "5 phút trước",
  },

  {
    id: "2",

    title: "🤖 Tin tức AI mới",

    summary:
      "OpenAI vừa công bố mô hình AI mới.",

    time: "15 phút trước",
  },

  {
    id: "3",

    title: "📚 Deadline môn học",

    summary:
      "AI nhắc bạn sắp đến hạn nộp bài tập.",

    time: "1 giờ trước",
  },
];