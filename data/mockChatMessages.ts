/*
  File: mockChatMessages.ts

  Chức năng:
  - Chứa dữ liệu chat AI giả lập
  - Dùng để test AI Chat UI
  - Dùng cho:
    + AI Create Rule Screen
*/

import { ChatMessage } from "@/types/ChatMessage";

/*
  mockChatMessages:
  dữ liệu chat giả lập
*/

export const mockChatMessages: ChatMessage[] =
  [
    {
      id: "1",

      message:
        "Bạn muốn theo dõi thông tin gì?",

      sender: "ai",
    },

    {
      id: "2",

      message:
        "Tôi muốn theo dõi giá iPhone trên Shopee",

      sender: "user",
    },

    {
      id: "3",

      message:
        "Bạn muốn nhận thông báo khi nào?",

      sender: "ai",
    },

    {
      id: "4",

      message: "Khi giá giảm",

      sender: "user",
    },
  ];