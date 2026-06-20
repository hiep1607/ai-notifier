# Kế hoạch & Tiến độ — AI Notifier

> File này theo dõi: kiến trúc, việc ĐÃ LÀM, việc CẦN LÀM. Cập nhật sau mỗi task.
> Cập nhật lần cuối: 2026-06-20 (đã chạy SQL 0009/0010/0011; bảng user_settings đã tạo lại sạch — Giờ yên lặng VERIFY chạy được)

## Mục tiêu sản phẩm
Người dùng mô tả bằng ngôn ngữ tự nhiên → AI tạo **rule** → hệ thống **tự quét tin thật nhiều nguồn 24/7** → gửi **thông báo** đúng chủ đề/điều kiện, kèm link bài gốc.

## Kiến trúc hiện tại
```
App Expo (web + mobile)
   │  invoke
   ▼
Supabase Edge Functions ──► Gemini API (Google Search grounding)
   ├─ generate-rule : NL → Rule (hỏi lại khi thiếu, không bịa)
   └─ run-monitor   : tìm tin thật → lọc điều kiện → insert notifications → gửi push
   ▲
pg_cron (mỗi 15 phút) → run-monitor (quét nền, lọc rule tới hạn theo lịch)
```
- AI: **Gemini server-side** (key trong Supabase secret), KHÔNG còn Ollama local.
- Project ref: `idtibfiyfywcugdvlqal`. Deploy: `npx supabase functions deploy <fn> --project-ref idtibfiyfywcugdvlqal`.
- Quy ước hội thoại: câu mở đầu `!` = toàn quyền, không hỏi lại. Việc gì tự làm được thì tự làm.

---

## ✅ ĐÃ LÀM
- [x] Pipeline tin THẬT đa nguồn bằng Gemini + Google Search grounding.
- [x] Chuyển AI lên server (Edge Functions), bỏ Ollama; key giấu trong secret.
- [x] Chạy nền 24/7 bằng pg_cron (mỗi 15 phút).
- [x] Thông báo **theo điều kiện**: rule có `condition` chỉ báo khi bài thỏa.
- [x] Thông báo **chi tiết hơn**: `content` đầy đủ + mục `details` (phân tích sâu).
- [x] Mỗi lần quét 1 rule **chỉ 1 thông báo** (MAX_PER_RUN = 1).
- [x] **Tần suất linh hoạt**: lưu số phút, tối thiểu 30 phút; "Theo điều kiện" quét 15 phút (ẩn).
- [x] **Đặt giờ cụ thể** (`run_at`, giờ VN): vd "Hằng ngày lúc 08:00".
- [x] Tạo rule **chặt chẽ**: thiếu info thì hỏi, yêu cầu vô lý thì giải thích.
- [x] **Sắp xếp rule** theo thời gian tạo (cũ → mới) ở Home + Rules.
- [x] **Push notification** (code): đăng ký token, gửi Expo Push từ run-monitor, bảng push_tokens.
- [x] Deploy generate-rule + run-monitor; cron đã bật.
- [x] **Tối ưu quota Gemini**: cron là bộ lập lịch DUY NHẤT (lọc `isDue` theo `last_run_at`+tần suất); Home không quét trùng nữa (chỉ đọc tin); refresh thủ công throttle 5'; client retry lỗi tạm (không retry 429); server gặp 429/503 thì DỪNG sớm (giữ `last_run_at` để quét lại) + trần 8 rule/lần.
- [x] **Trigger "thay đổi"**: lưu `last_value` mỗi rule; truyền giá trị lần trước vào Gemini để chấm `changed`/`matches_condition`; rule "theo điều kiện" chỉ báo khi số liệu THỰC SỰ đổi so với lần trước (migration 0008).
- [x] **Tách nhiều rule từ 1 câu**: generate-rule trả về MẢNG `rules` (tách chủ đề độc lập, giữ chung nếu cùng 1 thứ, vẫn hỏi lại khi thiếu); UI hiện nhiều card ("Rule i/N", xóa bớt được) + tạo hàng loạt 1 lượt. Tương thích ngược shape cũ.
- [x] **Phân quyền run-monitor**: anon key là công khai nên không tin được. Cron gọi bằng service_role → admin (quét tất cả); app gọi kèm JWT → xác thực, lấy userId TỪ token (bỏ qua userId body), chỉ quét rule của mình; ruleId người khác → 403; anon thuần → 401. Không cần thêm secret / sửa SQL (cron đã dùng service_role).
- [x] **"Để êm" theo rule (mute push)**: nút bật/tắt trong chi tiết rule — rule VẪN chạy & VẪN tạo thông báo (xem trong app), chỉ KHÔNG đẩy push về máy. Server `run-monitor` bỏ qua `sendPush` khi `rule.muted`; thẻ rule hiện nhãn "Để êm" (migration 0010 thêm cột `muted`).
- [x] **Nhóm thông báo theo ngày** (Hôm nay / Hôm qua / dd/mm) ở tab Thông báo.
- [x] **Empty state có nút hành động**: Home + Notifications trống → nút tạo rule.
- [x] **AI Insight động**: thẻ ở Home lấy tóm tắt tin quan trọng/mới nhất THẬT, bấm mở đúng thông báo.
- [x] **Onboarding lần đầu**: 3 slide giới thiệu khi đăng nhập lần đầu trên thiết bị (cờ `@onboarded`).
- [x] **Badge tab Alerts**: đã có sẵn; cap hiển thị "99+".
- [x] **Giờ yên lặng (tùy chỉnh)**: trong Settings có nút bật/tắt + 2 thanh trượt chọn giờ bắt đầu/kết thúc (vắt qua nửa đêm OK). Trong khung này server `run-monitor` KHÔNG đẩy push (tin vẫn vào app). Lưu trên DB `user_settings` để server đọc (migration 0011); slider dùng `@react-native-community/slider`.

## ⏳ ĐANG CHỜ NGƯỜI DÙNG (tôi không tự làm được)
- [x] **Chạy SQL `0009_notification_related.sql`** (cột `related_notification_id`) — user xác nhận đã chạy.
- [x] **Chạy SQL `0010_rule_muted.sql`** (cột `muted`) — user xác nhận đã chạy.
- [x] **Chạy SQL `0011_user_settings.sql`** (bảng `user_settings`) — đã phải DROP + tạo lại bảng sạch (bảng cũ trùng tên có FK sai → 23503); "Giờ yên lặng" đã lưu OK.
- [ ] **Chạy SQL** gộp (`run_at` + `push_tokens`) trong Supabase SQL Editor — tôi không có mật khẩu DB.
- [ ] **Đổi key Gemini** — key cũ đã lộ trong ảnh chụp lúc setup (bảo mật).
- [ ] **EAS init + dev build** để nhận push thật trên điện thoại (cần tài khoản Expo + thiết bị; build cloud tính phí).
- [ ] **Chạy SQL `0012_admin_logs.sql`** (bảng `usage_logs` + `cron_runs`) — để trang Quản trị hiện được Quota Gemini + Lịch sử cron. KHÔNG chạy thì 2 mục đó báo "chưa bật log"; phần còn lại của trang vẫn chạy bình thường.

## 📋 CẦN LÀM TIẾP (backlog, ưu tiên trên xuống)
- [x] **Polish UI/UX**: tìm rule (header search), hiện lịch + điều kiện trên thẻ rule (Rules + Home), trạng thái rỗng theo ngữ cảnh; notifications đã có sẵn search/filter/empty/swipe-delete.
- [ ] (mở rộng nếu cần) lọc thông báo theo rule/danh mục; badge unread trên tab; ẩn nút "Đọc bài gốc" đã xong (chuyển thành "Xem thông báo trước").
- [x] **Trang quản trị (Admin Dashboard) — CHỈ ADMIN** — Pha 1/2/3 XONG (xem kế hoạch bên dưới). Còn chờ user chạy SQL 0012 để bật Quota/Cron.

---

## 🛠 KẾ HOẠCH: Trang quản trị (Admin Dashboard) — chỉ chủ app
> Mục tiêu: 1 nơi để theo dõi & vận hành toàn hệ thống (mọi user/rule/cron/quota), không phải mò Supabase Dashboard.

### Nơi đặt (đề xuất)
- **Route `/admin` trong chính app Expo hiện tại** (web là chính), KHÔNG dựng project web thứ 2.
- Lý do: tái dùng auth + Supabase client + pipeline deploy/OTA sẵn có; chỉ thêm 1 màn ẩn, vào bằng tài khoản admin. Trên mobile ẩn entry, dùng chủ yếu trên trình duyệt.

### Bảo mật (BẮT BUỘC — không được phá RLS)
- RLS hiện chặn mỗi user chỉ thấy dữ liệu của mình. Admin cần đọc TẤT CẢ → KHÔNG nới RLS.
- Cách đúng: **Edge Function `admin-api` (service_role)** xác thực JWT → kiểm tra user nằm trong **allowlist admin** → mới trả dữ liệu tổng hợp. Client `/admin` chỉ gọi function này.
- Cần: bảng `admins(user_id)` (hoặc allowlist env) để phân quyền; gate UI + gate server (2 lớp).

### Tính năng (chia pha)
- **Pha 1 — MVP (xem + vận hành cơ bản)**
  - Tổng quan: số user, số rule (bật/tắt/muted), số thông báo (hôm nay/tổng), token push.
  - Danh sách RULE toàn hệ thống: chủ đề, tần suất, `last_run_at`, `muted`, `last_value`; lọc/tìm.
  - Nút **chạy thử 1 rule** (admin trigger run-monitor) để soi lỗi.
- **Pha 2 — Người dùng & nội dung**
  - Danh sách user: email, ngày tạo, số rule, số thông báo, hoạt động cuối; mở chi tiết 1 user.
  - Stream thông báo mới nhất toàn hệ thống (soi chất lượng AI + link đúng/sai), lọc category/sentiment.
- **Pha 3 — Vận hành & quota**
  - Lịch sử cron (thành công/lỗi/HTTP status). *(cần hạ tầng log — xem dưới)*
  - Theo dõi **quota Gemini/ngày** + cảnh báo gần ngưỡng 1.500. *(cần log usage)*
  - Gửi **push test**; quản lý danh sách admin.

### Hạ tầng còn THIẾU phải làm trước (gaps)
1. `admins` (phân quyền) + Edge Function `admin-api` (service_role, check admin).
2. **Log quota Gemini**: hiện KHÔNG đếm số call/429 → thêm bảng `usage_logs` (hoặc đếm trong run-monitor) thì Pha 3 mới có số liệu.
3. **Log cron run**: tạo bảng `cron_runs` (mỗi lần run-monitor: số rule quét, lỗi, thời lượng) — hoặc đọc tạm `net._http_response`.

### Thứ tự làm gợi ý
admins + admin-api (service_role) → route `/admin` gate → Pha 1 (overview + rule list + chạy thử) → log usage/cron → Pha 2 → Pha 3.

### Tiến độ
- [x] **Pha 1 (2026-06-20)**: Edge Function `admin-api` (service_role + gate admin theo secret `ADMIN_EMAILS`, hiện = tonghiep1607@gmail.com); `lib/admin.ts`; màn `app/admin.tsx` (overview + danh sách mọi rule + nút "Chạy thử"); lối vào trong Settings (chỉ admin); route đăng ký ở `_layout.tsx`. Smoke test gọi không auth → 401. Đổi danh sách admin = `npx supabase secrets set ADMIN_EMAILS="a@x,b@y" --project-ref idtibfiyfywcugdvlqal` (KHÔNG cần đổi code).
- [x] **Pha 2 (2026-06-20)**: admin-api actions `users`/`user_detail`/`notifications`; màn `app/admin-users.tsx` (danh sách + thống kê), `app/admin-user-detail.tsx` (info + rule + tb + token + giờ yên lặng + nút push test), `app/admin-notifications.tsx` (stream toàn hệ thống + lọc sentiment). Nút điều hướng Người dùng/Thông báo trên trang admin.
- [x] **Pha 3 (2026-06-20)**: migration `0012_admin_logs.sql` (usage_logs + cron_runs, RLS no-policy → chỉ service_role). run-monitor ghi `usage_logs` mỗi call Gemini + `cron_runs` mỗi lần chạy (best-effort, bảng chưa có thì nuốt lỗi). admin-api actions `usage` (quota 7 ngày, ngưỡng 1.500), `cron_runs` (40 lần gần nhất), `push_test`. Trang admin hiện thanh Quota + lịch sử cron; chờ user chạy SQL 0012 để có số liệu.

---

## 🐞 Lỗi đã gặp & cách giải quyết
Giải thích chi tiết từng lỗi (hệ thống, ảnh hưởng mọi rule) ở **[PROJECT_CONTEXT.md §3](PROJECT_CONTEXT.md#3--lỗi-đã-gặp--cách-giải-quyết)**. Tóm tắt:
1. **Dedup khóa cứng theo URL** → chủ đề số liệu (thời tiết/giá) bị chặn vĩnh viễn → dedup theo URL + `last_value`.
2. **Bỏ đói rule khi >8 rule** → sắp theo `last_run_at` tăng dần, xoay vòng công bằng.
3. **Đốt quota Gemini** → cron là lịch duy nhất, bỏ auto-scan client, dừng sớm khi 429, trần 8 rule/lần.
4. **Quét xong im lặng** → rule định kỳ/đặt giờ LUÔN gửi (tin / "chưa thay đổi" + link cũ / "chưa tìm thấy" + tin liên quan).
5. **Rule ghim giờ không đúng giờ** → khung [giờ hẹn, +15'), guard chu kỳ, xử lý quanh nửa đêm.
6. **Rule mơ hồ** → xử lý lúc tạo: hỏi lại, không bịa điều kiện.
7. **Anon key công khai lạm dụng run-monitor** → xác thực JWT, lấy userId từ token, chặn 401/403.

---

## Nhật ký thay đổi
- 2026-06-20: Giảm tải quét free tier — `MAX_RULES_PER_RUN` 8 → 4 (cron quét ít rule/nhịp hơn để đỡ chạm quota Gemini free). Deploy run-monitor. Bối cảnh: thử bật Gemini trả phí (Tier 1) để hết quota nhưng thẻ (Visa ảo MB) bị Google từ chối `OR_BACR2_31` ở khâu lập billing recurring (thẻ trả Claude 1 lần thì OK). TẠM giữ free tier; sẽ thử lại sau (Buy credits 1 lần / đợi 24h / thẻ credit/recurring). Build APK mới gộp toàn bộ thay đổi: build d9243f56.
- 2026-06-20: Thêm NHÃN RULE trên mỗi thông báo (tab Thông báo) — chip có tên rule (📌) ở đầu card để nhìn là biết thông báo của rule nào. fetchNotifications lấy thêm title/keyword → map rule_id→tên. Sửa JS, test Expo Go/web ngay.
- 2026-06-20: Deploy web PUBLIC lên EAS Hosting. Lệnh: `npx expo export -p web` → `eas deploy --prod`. **Production URL: https://ai-notifier-new.expo.app** (ai mở trên PC/điện thoại cũng được, không cần cài). Biến `.env` (EXPO_PUBLIC_*) tự nhúng khi export; ANTHROPIC_KEY rỗng nên không lộ. Đẩy bản web mới: export lại + `eas deploy --prod`; client tự nạp lại nhờ webAutoUpdate. (Lưu ý lỗi "bucket does not exist" lần đầu — chạy lại lệnh là được.)
- 2026-06-20: Android/iOS tự cập nhật OTA bằng EAS Update — cài `expo-updates`, `eas update:configure` (app.json: `updates.url` + `runtimeVersion.policy=appVersion`). `lib/nativeAutoUpdate.ts` gọi từ `_layout.tsx`: khi mở app `checkForUpdateAsync`→`fetchUpdateAsync`→`reloadAsync` (no-op trên web/Expo Go/dev). CẦN 1 LẦN: build APK mới có expo-updates rồi cài (`eas build -p android --profile preview`). Sau đó đẩy bản JS bằng `eas update --branch <branch>` là máy tự nhận, không gỡ-cài lại.
- 2026-06-20: Web tự cập nhật bản mới (`lib/webAutoUpdate.ts`, gọi từ `app/_layout.tsx`, chỉ web). Định kỳ 60s + khi quay lại tab: fetch `/?v=<ts>` no-store → trích chữ ký file js/css băm trong index.html, khác bản đang chạy = vừa deploy → `location.reload()`. Chặn reload khi đang gõ (input/textarea/contentEditable) để khỏi mất nội dung. Hết cảnh xoá cache + tải lại tay.
- 2026-06-20: Cải thiện nội dung thông báo (prompt run-monitor, áp dụng MỌI thông báo): (1) thay đổi số liệu phải nêu RÕ "từ [mức cũ] → [mức mới]" thay vì chỉ chênh lệch; (2) ưu tiên đơn vị/tiền tệ Việt Nam, số liệu nước ngoài kèm quy đổi trong ngoặc (trừ khi rule yêu cầu đơn vị nước ngoài). Sửa SEARCH_SYSTEM + field content/ai_summary. Deploy lại run-monitor.
- 2026-06-20: FIX auto không gửi — cron bị 401 "UNAUTHORIZED_INVALID_JWT_FORMAT". Nguyên nhân: project dùng API key kiểu MỚI (`sb_publishable_`/`sb_secret_`, KHÔNG phải JWT), nhưng Edge Function (verify_jwt) yêu cầu JWT hợp lệ ở header. Cron đang gắn `sb_secret_` → bị từ chối. Sửa: lấy **legacy service_role JWT** (`eyJ...`) ở Settings → API Keys → Legacy API keys, chạy lại `cron.schedule` migration 0004 với key đó. Sau sửa: `net._http_response` trả 200 `{"inserted":2,"checked":2}` → cron chạy thật. Lưu ý: chẩn đoán bằng `select status_code, content from net._http_response order by created desc` (cron.job_run_details "succeeded" chỉ là đã GỬI request, không phản ánh kết quả thật). Còn thấy `quotaHit:true` do backlog rule dồn lại sau nhiều giờ 401 → tự hồi dần (giữ last_run_at khi quota).
- 2026-06-20: FIX link "Đọc bài gốc" trỏ sai bài. Trước đây dùng `top.source_url` (AI tự ghi → hay bịa URL sai). Đổi ưu tiên URL grounding THẬT (Google Search metadata). Vì URL grounding đổi mỗi lần gọi nên đổi chống-trùng sang THEO TIÊU ĐỀ (seenTitles) thay vì theo URL. Deploy lại run-monitor.
- 2026-06-20: FIX bàn phím che ô nhập (create-rule + manual-rule). Do edge-to-edge Android không tự resize, `KeyboardAvoidingView behavior` để `undefined` trên Android → bàn phím che chat. Đổi `behavior="padding"` cho cả 2 nền. (register dùng "height" nên không sao.) Sửa JS — test ngay trong Expo Go.
- 2026-06-20: Thương hiệu "Nofy". Đổi tên app hiển thị `ai-notifier-new` → **"Nofy"** (app.json name; slug/package giữ nguyên). Icon mới: cắt từ logo Nofy gốc (`assets/images/nofy-soure.png`) bằng Pillow (scripts/crop_icon.py), chọn tông VIBRANT (hồng-tím→xanh, rực rỡ trẻ trung) (scripts/finalize_icon.py) → `icon.png` + `adaptive-icon.png` (backgroundColor #FEFEFE, bỏ background/monochrome cũ). CHƯA BUILD — gộp với các thay đổi sau rồi build 1 thể. Scripts ở scripts/ (make_icon=vẽ tay đã bỏ, crop_icon, variants, finalize_icon).
- 2026-06-20: Push Android (FCM) hoàn tất phía hạ tầng. Tạo Firebase project `ai-notifier-52174`, thêm app Android `com.hiep1607.ainotifiernew`, gắn `google-services.json` vào app.json (`android.googleServicesFile`) + commit; `fcm-service-account.json` gitignore (bí mật). Nạp FCM V1 service account key lên Expo credentials (web). Build APK mới có FCM: build d04c3cb8 → FINISHED. CÒN: user cài APK mới + bật Autostart/bỏ giới hạn pin (Xiaomi/MIUI) + cấp quyền thông báo → test push thật.
- 2026-06-20: Build Web + Android. Web: `npx expo export --platform web` → `dist/` OK. Android: thêm `android.package`/`ios.bundleIdentifier`/`owner: hiep1607` = `com.hiep1607.ainotifiernew`, tạo `eas.json` (profile `preview` = APK). Đã đăng nhập EAS (hiep1607), `eas init` tạo project @hiep1607/ai-notifier-new (projectId 6f7e9eb6... ghi vào app.json), keystore tự tạo. QUAN TRỌNG: build cloud KHÔNG có `.env` → đã nạp `EXPO_PUBLIC_SUPABASE_URL` + `ANON_KEY` vào EAS env (preview+production, plaintext) qua `eas env:create`, build lại OK. Build APK đang chạy: build 7d5f6db1. CÒN LÀM: push Android cần FCM credentials (Firebase) — làm sau khi cài APK.
- 2026-06-20: Tối ưu chi phí AI — tách model theo task: `geminiGenerate` thêm tham số `model?` (mặc định giữ `gemini-2.5-flash`); generate-rule (chỉ trích JSON, không cần grounding) hạ xuống `gemini-2.5-flash-lite` ($0.10/$0.40, rẻ ~33%, không giảm chất lượng); run-monitor GIỮ `gemini-2.5-flash` để còn Google Search grounding (free 1.500 lượt/ngày). Deploy lại generate-rule. (Kết luận khảo sát: ở quy mô cá nhân grounding đang miễn phí nên giữ kiến trúc Gemini; đổi sang API rẻ hơn không tiết kiệm đáng kể mà mất grounding → tin dễ bịa.)
- 2026-06-20: Giờ yên lặng (tùy chỉnh) — Settings có toggle + 2 slider chọn giờ; server `run-monitor` bỏ qua push trong khung (vắt nửa đêm OK), tin vẫn vào app. Lưu DB `user_settings`. LƯU Ý: bảng `user_settings` cũ trùng tên đã tồn tại sẵn với FK sai (trỏ sai bảng) gây loạt lỗi PGRST204 → 42P10 → 23503; đã DROP + tạo lại sạch (`user_id` PK → auth.users). Client dùng update→insert (không upsert onConflict) cho an toàn ràng buộc. Verify lưu OK.
- 2026-06-20: "Để êm" theo rule (mute push, cột `muted`, migration 0010); nhóm thông báo theo ngày; empty state có nút CTA; AI Insight động (tin thật); onboarding 3 slide lần đầu; badge tab cap "99+".
- 2026-06-19: Nút "+" tạo rule (màn Rules) giờ KÉO THẢ tự do được (Gesture.Pan + reanimated), vẫn bấm để mở menu (Gesture.Tap, Race); nhớ vị trí qua AsyncStorage @fab_pos. Chạy cả web lẫn native.
- 2026-06-19: FIX mobile — (1) cuộn không tới cuối ở màn chi tiết (nút dưới bị thanh điều hướng Android che): thêm SafeAreaProvider + paddingBottom theo insets.bottom cho notification-detail & rule-detail. (2) Công tắc bật/tắt rule giờ BẤM được (bọc TouchableOpacity + Switch pointerEvents none + hitSlop) ở rule-detail & danh sách Rules.
- 2026-06-19: FIX crash/màn trắng trên Expo Go (native) — Reanimated 4 nhưng babel còn dùng plugin cũ `react-native-reanimated/plugin` → worklet không biên dịch → crash native (web vẫn chạy). Đổi sang `react-native-worklets/plugin`. Bọc app bằng `GestureHandlerRootView` (cần cho vuốt-xóa trên native). CẦN restart `npx expo start -c` (xóa cache) để babel ăn.
- 2026-06-19: Chi tiết rule — đưa 2 nút "Kiểm tra tin ngay" + "Xóa rule" lên TRÊN danh sách thông báo; mặc định chỉ hiện 5 thông báo gần nhất, thêm nút "Xem tất cả thông báo (N)" / "Thu gọn" để xổ hết (fetch tối đa 50). Chỉ sửa client.
- 2026-06-19: Polish UI/UX — Rules: kích hoạt thanh tìm kiếm ở header (trước là icon chết), thẻ rule hiện lịch (formatSchedule) + điều kiện, empty state theo tab/tìm kiếm. Home: thêm dòng lịch + điều kiện vào thẻ rule đang hoạt động. Chỉ sửa client, tsc sạch.
- 2026-06-19: Fallback "chưa có thay đổi" giờ link về THÔNG BÁO TRƯỚC trong app (không có URL bài mới) — thêm cột `related_notification_id` (migration 0009), run-monitor lưu id tb gần nhất, notification-detail hiện nút "Xem thông báo trước" khi source_url rỗng. Deploy lại run-monitor.
- 2026-06-19: Phân quyền run-monitor — chống lạm dụng anon key (công khai). Phân biệt cron (service_role = admin, quét tất cả) với người dùng (JWT đăng nhập): xác thực token, lấy userId từ token thay vì body, chỉ quét rule của mình; chặn ruleId người khác (403) và anon thuần (401). Test 401 OK. Deploy lại run-monitor.
- 2026-06-19: Luôn-gửi cho rule định kỳ/đặt giờ — không tìm thấy tin vẫn gửi tb: có tb trước → "chưa thay đổi" + link trỏ tb trước; chưa có → "chưa tìm thấy" + tin liên quan gần nhất; tuyệt đối không im. Rule "theo điều kiện" giữ im khi chưa thỏa. Rule đặt giờ gửi đúng giờ [target, target+15). Deploy lại run-monitor.
- 2026-06-19: Bỏ phụ thuộc cột last_value cho #8 — khi chưa có mốc cũ thì KHÔNG tự nhận "đã đổi" (hết báo lặp mỗi phiên); cơ chế chính = AI chấm điều kiện rule mỗi phiên + dedup URL. Deploy lại run-monitor.
- 2026-06-19: Quét sớm cho rule ĐẶT GIỜ — khung [target-15, target+15): bắn sát giờ kể cả cron lỡ nhịp; xử lý mốc gần nửa đêm (vòng 24h). KHÔNG áp cho định kỳ thuần (tránh trôi tần suất). Deploy lại run-monitor.
- 2026-06-19: Soát hệ thống — sửa lỗi "bỏ đói" rule khi >8 rule (cron giờ sắp theo last_run_at tăng dần, xoay vòng công bằng, rule đặt giờ không bị chen). Deploy lại run-monitor.
- 2026-06-19: Sửa chống-trùng cho chủ đề kiểu giá-trị (thời tiết/giá): dedup theo URL + last_value, cùng URL mà số liệu đổi vẫn báo (trước đây URL đứng yên bị chặn vĩnh viễn). + retry generate-rule. Deploy lại run-monitor.
- 2026-06-19: Tách nhiều rule từ 1 câu — generate-rule trả mảng rules, UI nhiều card + tạo hàng loạt. Deploy lại generate-rule.
- 2026-06-19: Trigger "thay đổi" — lưu last_value, so sánh với lần trước để chỉ báo khi số liệu thực sự đổi (migration 0008). Deploy lại run-monitor.
- 2026-06-19: Tối ưu quota Gemini — bỏ quét trùng ở Home (cron là lịch duy nhất), client retry lỗi tạm, server dừng sớm khi 429 + trần 8 rule/lần. Deploy lại run-monitor.
- 2026-06-19: Tạo file kế hoạch. Hoàn tất push notification (code) + deploy 2 function.
- 2026-06-19: Đặt giờ cụ thể (run_at) + sắp xếp rule theo created_at.
- 2026-06-19: Tần suất linh hoạt (số phút, min 30) + ẩn 15 phút cho "Theo điều kiện".
- 2026-06-19: Tạo rule chặt chẽ (hỏi lại / giải thích yêu cầu vô lý).
- 2026-06-19: Thông báo chi tiết + 1/lần + lịch per-rule (last_run_at, cron 15 phút).
- 2026-06-19: Chuyển AI sang Gemini server-side + pg_cron 24/7 (bỏ Ollama).
