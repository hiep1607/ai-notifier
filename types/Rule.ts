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
  muted?: boolean;     // true = vẫn nhận tin trong app nhưng KHÔNG đẩy push/để yên lặng
  notify_mode?: "all" | "important"; // "important" = bỏ fallback + chỉ báo tin quan trọng/thỏa điều kiện
  source_type?: string; // 'reminder' = nhắc hẹn 1 lần (migration 0016); mặc định 'search'
  remind_at?: string;   // thời điểm nhắc (ISO) — chỉ dùng với reminder
  is_active: boolean;
  created_at?: string;
}
