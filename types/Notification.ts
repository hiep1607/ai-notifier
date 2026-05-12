/*
  File: Notification.ts

  Chức năng:
  - Định nghĩa kiểu dữ liệu Notification
  - Dùng cho:
    + NotificationCard
    + Notifications Screen
*/

export interface Notification {
  /*
    ID notification
  */
  id: string;

  /*
    Tiêu đề notification
  */
  title: string;

  /*
    AI summary
  */
  summary: string;

  /*
    Thời gian notification
  */
  time: string;
}