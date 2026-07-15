-- Migration lịch sử: logic tick cho reminder + rule ghim giờ nằm trong run-monitor;
-- lịch SQL cuối cùng được tạo tập trung tại 0027_portable_cron.sql.
create extension if not exists pg_cron;
create extension if not exists pg_net;
