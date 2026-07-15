-- Phase 2B — Bật Row Level Security cho rules & notifications
-- Chạy file này trong Supabase Dashboard → SQL Editor → New query → Run

-- ===== RULES =====
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;

-- Chỉ xem rules của chính mình
DROP POLICY IF EXISTS "rules_select" ON rules;
CREATE POLICY "rules_select" ON rules
  FOR SELECT USING (auth.uid() = user_id);

-- Chỉ insert rule với user_id = chính mình (tránh giả mạo user_id)
DROP POLICY IF EXISTS "rules_insert" ON rules;
CREATE POLICY "rules_insert" ON rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Chỉ sửa rules của chính mình
DROP POLICY IF EXISTS "rules_update" ON rules;
CREATE POLICY "rules_update" ON rules
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chỉ xóa rules của chính mình
DROP POLICY IF EXISTS "rules_delete" ON rules;
CREATE POLICY "rules_delete" ON rules
  FOR DELETE USING (auth.uid() = user_id);


-- ===== NOTIFICATIONS =====
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Chỉ xem notifications thuộc rule của mình
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (
    rule_id IN (SELECT id FROM rules WHERE user_id = auth.uid())
  );

-- Chỉ insert notification vào rule của mình
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (
    rule_id IN (SELECT id FROM rules WHERE user_id = auth.uid())
  );

-- Chỉ update notification thuộc rule của mình
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (
    rule_id IN (SELECT id FROM rules WHERE user_id = auth.uid())
  ) WITH CHECK (
    rule_id IN (SELECT id FROM rules WHERE user_id = auth.uid())
  );

-- Chỉ xóa notification thuộc rule của mình
DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications
  FOR DELETE USING (
    rule_id IN (SELECT id FROM rules WHERE user_id = auth.uid())
  );
