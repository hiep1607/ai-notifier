-- Migration lịch sử. 0027 chuyển URL/service key đang dùng sang Supabase Vault và
-- dựng lại toàn bộ job, vì vậy không còn placeholder hay secret trong migration.
create extension if not exists pg_cron;
create extension if not exists pg_net;
