export interface Notification {
  id: string;
  rule_id: string;
  title: string;
  content: string;
  ai_summary?: string;
  details?: string;    // Phân tích chi tiết của AI (dài hơn content)
  source?: string;     // Nguồn tin: VnExpress, CafeF...
  source_url?: string; // Link bài viết gốc AI lấy thông tin
  related_notification_id?: string; // Trỏ tới thông báo trước (fallback "chưa có thay đổi", khi không có URL)
  category?: string;   // Danh mục tin (cùng hệ với rule)
  sentiment?: string;  // positive | neutral | negative
  is_read: boolean;
  is_important: boolean;
  created_at?: string;
}
