-- AUDIT "RULE BÁO SAI GIỜ" — dán từng khối vào Supabase Dashboard → SQL Editor.
-- Mục đích: nhìn DỮ LIỆU THẬT xem rule ghim giờ (run_at) bắn lệch bao nhiêu phút và vì sao.
--
-- Cách đọc kết quả khối 1 (quan trọng nhất):
--   lech_phut ~ 0-2   : tick mỗi phút (0022) hoạt động tốt — đúng giờ.
--   lech_phut 3-15    : tick lỡ (function bận/lỗi lượt đó) → cron chính 15' bắt lại. Bình thường.
--   lech_phut 15-240  : mốc hẹn dính HẾT QUOTA Gemini / hàng đợi dài → cơ chế "bắn muộn
--                       còn hơn nuốt" (catch-up 4h) đẩy thông báo tới muộn. Đây thường là
--                       thứ nhìn thấy là "sai giờ". Đối chiếu khối 2: nếu cùng khung giờ đó
--                       quota_hit=true nhiều thì đúng nguyên nhân quota.
--   không có dòng nào trong ngày cho 1 rule: cả 4h catch-up đều kẹt → mất mốc hôm đó.

-- ============ 1) Rule ghim giờ: từng thông báo lệch bao nhiêu phút so với run_at ============
select
  r.title                                                            as rule,
  r.run_at                                                           as gio_hen,
  to_char(n.created_at at time zone 'Asia/Ho_Chi_Minh',
          'DD/MM HH24:MI')                                           as bao_luc_gio_vn,
  mod( (extract(hour   from (n.created_at at time zone 'Asia/Ho_Chi_Minh'))::int * 60
      + extract(minute from (n.created_at at time zone 'Asia/Ho_Chi_Minh'))::int)
      - (split_part(r.run_at, ':', 1)::int * 60 + split_part(r.run_at, ':', 2)::int)
      + 1440, 1440)                                                  as lech_phut,
  n.title                                                            as thong_bao
from notifications n
join rules r on r.id = n.rule_id
where r.run_at ~ '^\d{1,2}:\d{2}$'
  and coalesce(r.frequency, '') <> 'change'
  and n.created_at > now() - interval '7 days'
order by n.created_at desc;

-- ============ 2) Sức khỏe cron 3 ngày qua: khung giờ nào kẹt quota ============
select
  to_char(date_trunc('hour', created_at at time zone 'Asia/Ho_Chi_Minh'),
          'DD/MM HH24:00')                       as khung_gio_vn,
  count(*)                                       as tong_luot,
  count(*) filter (where quota_hit)              as luot_ket_quota,
  sum(inserted)                                  as tin_da_tao
from cron_runs
where created_at > now() - interval '3 days'
group by 1
order by 1 desc;

-- ============ 3) Tick mỗi phút có chạy không? (phải thấy trigger='tick' gần đây) ============
select trigger, count(*) as so_luot, max(created_at) as lan_cuoi
from cron_runs
where created_at > now() - interval '2 days'
group by trigger;

-- Nếu KHÔNG có dòng trigger='tick': job reminder-tick chết/chưa chạy 0022 →
--   select jobname, schedule, active from cron.job;
--   select status_code, left(content::text,120), created from net._http_response
--   order by created desc limit 10;   -- 401 = key sai (xem 0019)

-- ============ 4) Rule có cấu hình lịch DỄ GÂY HIỂU LẦM ============
-- a) run_at + frequency='change': server BỎ QUA run_at (rule điều kiện không ghim giờ)
--    → thông báo đến bất kỳ lúc nào điều kiện thỏa, user tưởng "sai giờ".
-- b) run_at + frequency < 1440 (vd "Mỗi giờ lúc 08:00"): server coi là rule GHIM GIỜ
--    → chỉ báo 1 LẦN/ngày lúc run_at, không phải mỗi giờ như nhãn hiển thị.
select id, title, frequency, run_at,
       case
         when frequency = 'change' then 'run_at bị bỏ qua (rule điều kiện)'
         when frequency ~ '^\d+$' and frequency::int < 1440 then 'chỉ báo 1 lần/ngày lúc run_at'
       end as van_de
from rules
where run_at is not null and run_at <> ''
  and (frequency = 'change' or (frequency ~ '^\d+$' and frequency::int < 1440));

-- ============ 5) Lỗi quét gần nhất của từng rule (cột last_error, migration 0020) ============
select title, frequency, run_at,
       to_char(last_run_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') as quet_lan_cuoi,
       last_error
from rules
where is_active
order by last_run_at desc nulls last;
