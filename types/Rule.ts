export interface Rule {
  id: string;
  user_id: string;
  title: string;
  description: string;
  keyword: string;
  category?: string;   // Danh mục: Tài chính, Tin tức, Công nghệ...
  sources?: string;    // Nguồn theo dõi, phân tách bằng dấu phẩy
  frequency?: string;  // "change" (theo điều kiện) | số phút (định kỳ, vd "1440")
  run_at?: string;     // Giờ báo cụ thể (giờ VN) dạng "HH:MM"; rỗng = không ghim giờ
  condition?: string;  // Điều kiện kích hoạt thông báo
  last_value?: string; // Số liệu chính lần quét trước (trigger "thay đổi")
  is_active: boolean;
  created_at?: string;
}
