/*
  File: ChatMessage.ts

  Chức năng:
  - Định nghĩa kiểu dữ liệu Chat Message
  - Dùng cho:
    + ChatBubble
    + AI Chat Screen
*/

export interface ChatMessage {
  /*
    ID message
  */
  id: string;

  /*
    Nội dung tin nhắn
  */
  message: string;

  /*
    Người gửi
  */
  sender: "ai" | "user";
}