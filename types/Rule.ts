export interface Rule {
  id: string;
  user_id: string;
  title: string;
  description: string;
  keyword: string;
  category?: string;   // Danh mục: Tài chính, Tin tức, Công nghệ...
  sources?: string;    // Nguồn theo dõi, phân tách bằng dấu phẩy
  frequency?: string;  // Tần suất: realtime | hourly | daily | weekly
  condition?: string;  // Điều kiện kích hoạt thông báo
  is_active: boolean;
  created_at?: string;
}
