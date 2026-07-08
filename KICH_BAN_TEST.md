# KỊCH BẢN TEST — hệ thống xử lý các loại yêu cầu ra sao

> Chạy lần đầu 2026-07-03 bằng `node scripts/scenario-test.mjs` (gọi generate-rule THẬT trên server).
> Mục đích: soi cách hệ thống phân loại & phản hồi trước các yêu cầu đa dạng của người dùng,
> để đánh giá "xử lý đã hợp lý nhất chưa". Chấm: ✅ đúng kỳ vọng · ❌ sai · ⏳ chưa chạy được (AI hết lượt).

## Kết quả theo nhóm

### Nhóm 1 — Số liệu (đường provider, 0 quota)
| Kịch bản | Người dùng gõ | Kỳ vọng | Kết quả |
|---|---|---|---|
| weather-time | "mỗi sáng 6h30 báo thời tiết Đà Nẵng" | định kỳ hằng ngày, ghim 06:30 | ✅ 1440' @06:30, gắn noise:high đúng chuẩn (định kỳ + chủ đề ít biến động) |
| crypto-cond | "báo khi ETH giảm hơn 5% trong ngày" | theo điều kiện (change) + condition | ✅ đúng y kỳ vọng |
| fx-daily | "tỷ giá USD hằng ngày lúc 9h" | 1440 phút + run_at 09:00 | ✅ |

### Nhóm 2 — Tin tức
| multi-rule | "mỗi sáng 7h báo giá vàng và thời tiết Hà Nội" | TÁCH 2 rule cùng giờ 07:00 | ✅ tách đúng 2 rule |
|---|---|---|---|
| news-broad | "tin tức công nghệ AI mỗi ngày" | tạo được + cảnh báo chủ đề rộng (noise high) | ⚠️ hỏi lại "định kỳ hay theo điều kiện?" dù "mỗi ngày" đã rõ — không sai nhưng thừa 1 bước |

### Nhóm 3 — Phải HỎI LẠI / TỪ CHỐI hợp lý
| vague | "theo dõi giá ETH" | hỏi: định kỳ hay theo điều kiện? | ✅ hỏi đúng câu |
|---|---|---|---|
| too-fast | "báo giá vàng mỗi 5 phút" | giải thích min 30', gợi ý theo điều kiện | ✅ "tối thiểu 30 phút/lần... hay theo dõi theo điều kiện (chỉ báo khi vàng biến động mạnh)?" — đúng nguyên văn |
| impossible | "báo khi người yêu cũ đăng story instagram" | từ chối khéo + gợi ý nguồn thay thế | ✅ giải thích IG chặn máy đọc, gợi ý Telegram/YouTube/website |

### Nhóm 4 — Nhắc hẹn
| remind-abs | "nhắc tôi họp lớp ngày 20/7 lúc 19h" | reminder 2026-07-20T19:00 | ✅ đúng cả ngày giờ + offset VN |
|---|---|---|---|
| remind-rel | "nhắc tôi 10 phút nữa tắt máy giặt" | remind = giờ hiện tại +10' | ⏳ |
| remind-nodate | "nhắc tôi đi khám răng" | hỏi ngày giờ | ✅ hỏi đúng "ngày nào, mấy giờ?" |

### Nhóm 5 — Bản đồ nguồn (tự dựng URL, không cần người dùng đưa link)
| gh-trending | "gửi tôi các dự án nổi bật trên github vào mỗi sáng" | url=github.com/trending + đặt giờ sáng | ✅ tự ra đúng URL, 08:00 |
|---|---|---|---|
| gh-lang | "mỗi tuần tổng hợp dự án Python hot trên github" | trending/python?since=weekly | ⏳ |
| gh-release | "báo tôi khi expo/expo ra bản mới" | releases.atom | ⏳ |
| reddit | "bài hot trên r/vietnam mỗi tối 8h" | reddit .rss + 20:00 | ⏳ |
| telegram | "theo dõi kênh telegram durov" | t.me/s/durov | ⏳ |
| youtube-handle | "kênh youtube @MixiGaming có video mới" | hỏi xin link kênh (không suy được channel_id) | ⏳ |

### Nhóm 6 — MXH không hỗ trợ → từ chối + gợi ý
| facebook | "theo dõi facebook của Sơn Tùng MTP" | giải thích FB chặn + gợi ý thay thế | ✅ đúng nguyên văn mong muốn |
|---|---|---|---|
| tiktok | "kênh tiktok Lê Bống có video mới" | tương tự | ⏳ |
| x-twitter | "theo dõi twitter elonmusk" | giải thích X phải trả phí API | ⏳ |

### Nhóm 7 — URL người dùng đưa
| url-price | "báo khi sản phẩm này giảm dưới 500k <link>" | url + change + condition | ⏳ |
|---|---|---|---|
| url-login | "theo dõi điểm của tôi trên <link portal>" | tạo + nhắc cấp quyền đăng nhập trong message | ⏳ |
| url-nolink | "theo dõi trạng thái đơn hàng shopee của tôi" | xin link + dặn về cấp quyền | ✅ đúng nguyên văn |

## Tổng kết đợt 1
- **10/10 kịch bản chạy được: ĐỀU ĐÚNG kỳ vọng** — phân loại chuẩn (provider/tin tức/nhắc hẹn/url), tách nhiều rule đúng, hỏi lại đúng lúc, từ chối MXH kèm gợi ý đúng bài.
- **13 kịch bản còn ⏳**: không chạy được vì Gemini flash-lite **503 quá tải + 429 hết lượt** trong lúc test (một phần do chính đợt test bắn ~40 call + tính năng enrich mới cũng ăn thêm lượt). Chạy lại sau khi quota reset (~14h VN): `node scripts/scenario-test.mjs --only=weather-time,news-broad,too-fast,remind-rel,remind-nodate,gh-lang,gh-release,reddit,telegram,youtube-handle,tiktok,x-twitter,url-price,url-login`

## Tổng kết đợt 2 (đêm 2026-07-07 → 08)
- Chạy lại 14 kịch bản ⏳: **3 có kết quả** — weather-time ✅, remind-nodate ✅, news-broad ⚠️ (hỏi lại "định kỳ hay theo điều kiện" dù câu đã nói "mỗi ngày" — thừa 1 bước, chưa phải bug).
- **11 kịch bản vẫn ⏳ vì hết quota**: chờ 50-60s × 6 lần theo đúng gợi ý của server vẫn kẹt → quota NGÀY đã cạn (đợt test + cron 24/7 + enrich đốt). Chạy lại sau 14h VN:
  `node scripts/scenario-test.mjs --only=too-fast,remind-rel,gh-lang,gh-release,reddit,telegram,youtube-handle,tiktok,x-twitter,url-price,url-login`
- Đợt chạy này lộ ra **2 bug thật đã vá** (mục 3 + 4 dưới) — riêng vụ gemini.ts là bug NẶNG: transcribe đã sập âm thầm từ 05/07.

## Tổng kết đợt 3 (sáng 2026-07-08, ~10h40)
- **too-fast ✅** — "tối thiểu 30 phút/lần... hay theo dõi theo điều kiện (chỉ báo khi vàng biến động mạnh/chạm mức bạn muốn)?" — đúng nguyên văn kỳ vọng.
- **10 kịch bản còn lại vẫn kẹt quota NGÀY** (chạy lúc ~10h40-11h40 VN = quota hôm trước CHƯA reset — mốc reset là 0h Pacific = **14h VN**). gemini.ts giờ rút thẳng `quotaId` vào message lỗi → server xác nhận chính thức `PerDay`; generate-rule đã trả lời đúng sự thật: "hết lượt miễn phí HÔM NAY, reset ~14h".
- **Số liệu cho mục 2 (điểm nghẽn flash-lite) đã đủ**: 2 ngày liên tiếp cạn RPD trước cuối ngày (cron 24/7 + enrich + tick là nguồn đốt chính, đợt test chỉ vài chục call). Tới lúc quyết: giảm enrich (chỉ tin quan trọng) / gộp call / bật billing.
- Chạy nốt SAU 14h VN: `node scripts/scenario-test.mjs --only=remind-rel,gh-lang,gh-release,reddit,telegram,youtube-handle,tiktok,x-twitter,url-price,url-login`

## Phát hiện & đã vá ngay trong đợt test
1. **AI hết lượt → người dùng thấy nguyên cục JSON lỗi trong chat** (xấu, khó hiểu). ĐÃ VÁ: generate-rule
   bắt lỗi 429/503 và trả lời thân thiện "⏳ AI đang quá tải hoặc tạm hết lượt — thử lại sau vài phút"
   (deploy 2026-07-03).
2. **flash-lite thành điểm nghẽn quota mới**: pick bài + enrich bài gốc + trích trang + chấm điều kiện
   đều dồn về flash-lite. Cần theo dõi cột usage_logs vài ngày; nếu hay chạm trần thì giảm enrich
   (chỉ tin quan trọng) hoặc bật billing. *(chưa làm — chờ số liệu)*
3. **(đợt 2) gemini.ts khai báo `const parts` 2 LẦN trong cùng hàm** (thêm 2026-07-05 khi làm audio
   transcribe) = SyntaxError → MỌI function import gemini.ts **BOOT_ERROR khi deploy lại**;
   transcribe (deploy 05/07) đã sập âm thầm từ đó, generate-rule/run-monitor sống nhờ bundle cũ và
   chỉ lộ khi redeploy đêm 07/07. ĐÃ VÁ (đổi tên `outParts`) + deploy lại cả 3 function, verify
   generate-rule 200 / transcribe 401 / run-monitor 401 (= boot OK). BÀI HỌC: code Edge Function
   không được tsc/jest che chắn — sau MỌI lần deploy phải probe ngay 1 phát; sửa _shared/* thì
   deploy lại TẤT CẢ function dùng nó.
4. **(đợt 2) Phân loại 429 sai làm người dùng hiểu lầm**: server thấy "retry in ≤120s" là kết luận
   "chạm trần mỗi PHÚT — quota ngày vẫn còn", nhưng Gemini kèm "retry in ~60s" cả khi HẾT QUOTA NGÀY
   (chờ 60s×6 vẫn kẹt). ĐÃ VÁ: phân loại theo `quotaId` trong body lỗi (PerDay/PerMinute) trước,
   heuristic retry-giây chỉ là fallback; hết ngày → nói thẳng "hết lượt hôm nay, reset ~14h VN".
   Script kịch bản cũng học được cách này: gặp quota phút thì chờ đúng N giây server gợi ý,
   gặp quota ngày thì DỪNG cả loạt.

## Tổng kết đợt 4 (tối 2026-07-08, 21:37)
- **Quota NGÀY lại cạn dù mới reset lúc 14h** — cron nền (tick mỗi phút + cron 15' + enrich) đốt sạch RPD flash-lite trong ~7,5 tiếng. 10 kịch bản vẫn ⏳.
- Cơ chế mới chạy ĐÚNG: server trả "hết lượt miễn phí HÔM NAY" (quotaId=PerDay), script dừng cả loạt sau 1 call thay vì retry vô ích cả tiếng như đợt 2.
- **Hệ quả nghiêm trọng hơn bộ test**: từ ~21h mỗi tối (sớm hơn nếu nhiều rule), người dùng thật KHÔNG tạo được rule bằng AI (generate-rule ăn chung quota với quét nền). PHẢI giảm đốt quota — không còn là "chờ số liệu" nữa.

## Việc tiếp theo của bộ kịch bản
- [x] Chạy lại đợt 2 (đêm 07/07→08): thêm 3 kết quả, 11 kịch bản còn lại kẹt quota NGÀY.
- [x] Chạy lại đợt 3 (sáng 08/07): thêm too-fast ✅; xác nhận quotaId=PerDay.
- [ ] Chạy lại 10 kịch bản ⏳ SAU 14h VN 2026-07-08 (lệnh --only ghi ở "Tổng kết đợt 3"), cập nhật bảng này.
- [ ] Quyết phương án giảm đốt quota flash-lite (mục 2 — số liệu đã đủ: 2 ngày liên tiếp cạn RPD).
- [ ] Đợt 2 (cần tài khoản test): kiểm các kịch bản QUÉT thật — trang danh sách (trending liệt kê đủ 5-8 mục?),
      trang cần đăng nhập (thông báo 🔒 + nút Cho phép/Không), trang SPA (báo "không đọc được" thay vì bịa),
      trang sập giữa chừng, cookie hết hạn.
