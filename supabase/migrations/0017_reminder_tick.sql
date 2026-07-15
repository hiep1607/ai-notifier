-- Migration lịch sử: tick mỗi phút nay được cấu hình portable ở 0027.
create extension if not exists pg_cron;
create extension if not exists pg_net;
