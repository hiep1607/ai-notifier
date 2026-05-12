/*
  File: Rule.ts

  Chức năng:
  - Định nghĩa kiểu dữ liệu Rule
*/

export interface Rule {
  /*
    ID của Rule
  */
  id: string;

  /*
    Tiêu đề Rule
  */
  title: string;

  /*
    Mô tả Rule
  */
  description: string;

  /*
    Trạng thái hoạt động
  */
  active: boolean;
}