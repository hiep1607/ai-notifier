export interface Notification {
  id: string;
  rule_id: string;
  title: string;
  content: string;
  ai_summary?: string;
  details?: string;    // Phân tích chi tiết của AI (dài hơn content)
  source?: string;     // Nguồn tin: VnExpress, CafeF...
  source_url?: string; // Link bài viết gốc AI lấy thông tin
  category?: string;   // Danh mục tin (cùng hệ với rule)
  sentiment?: string;  // positive | neutral | negative
  is_read: boolean;
  is_important: boolean;
  created_at?: string;
}
