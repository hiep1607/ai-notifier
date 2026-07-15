-- Phản hồi chất lượng từ người dùng cho từng thông báo. Edge Function đọc các phản hồi
-- gần đây của cùng rule để tránh tiêu đề/nguồn thường xuyên bị đánh dấu không liên quan.
alter table public.notifications
  add column if not exists feedback text
    check (feedback is null or feedback in ('useful', 'not_relevant'));

alter table public.notifications
  add column if not exists feedback_at timestamptz;

create index if not exists notifications_rule_feedback_idx
  on public.notifications(rule_id, feedback, created_at desc)
  where feedback is not null;

