-- Bật hạ tầng cron/network. Lịch gọi Edge Function được tạo tập trung, không chứa
-- project ref/service key trong source, tại 0027_portable_cron.sql.
create extension if not exists pg_cron;
create extension if not exists pg_net;
