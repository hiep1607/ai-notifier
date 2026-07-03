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
  source_type?: string; // 'reminder' = nhắc hẹn 1 lần (0016); 'url' = theo dõi trang web (0018); mặc định 'search'
  remind_at?: string;   // thời điểm nhắc (ISO) — chỉ dùng với reminder
  watch_url?: string;   // URL trang cần theo dõi — chỉ dùng với source_type 'url' (migration 0018)
  watch_auth?: string;  // cookie/headers người dùng cấp cho trang cần đăng nhập (migration 0018)
  last_run_at?: string; // thời điểm hệ thống quét rule này lần gần nhất (migration 0005)
  last_error?: string;  // lỗi của lần quét gần nhất; null/rỗng = quét êm (migration 0020)
  is_active: boolean;
  created_at?: string;
}
