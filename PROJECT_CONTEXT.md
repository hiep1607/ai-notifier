# PROJECT_CONTEXT.md — AI Notifier

> Phân tích kiến trúc & trạng thái phát triển (cập nhật 2026-06-14)

---

## 1. Tổng quan

**AI Notifier** là ứng dụng mobile/web cho phép người dùng tạo "rule" theo dõi thông tin tự động bằng AI. Khi có tin tức liên quan keyword, AI sinh thông báo với tóm tắt và đánh giá mức độ quan trọng.

**Stack:** React Native + Expo Router + Supabase (BaaS) + Local Ollama / Anthropic Claude Edge Functions

**Nền tảng hỗ trợ:** Web (browser) + Mobile (Expo Go) — mọi thay đổi phải tương thích cả hai.

---

## 2. Kiến trúc phân tầng

```
┌──────────────────────────────────────────┐
│             FRONTEND (React Native)       │
│   Expo Router · React Context · RN Web    │
├──────────────────────────────────────────┤
│             BACKEND (Supabase)            │
│   Auth · Postgres DB · Edge Functions     │
├──────────────────────────────────────────┤
│                AI LAYER                   │
│  Local: Ollama (qwen2.5:3b) — web/PC only │
│  Cloud: Anthropic Claude Haiku via Edge   │
└──────────────────────────────────────────┘
```

### 2a. Frontend
- **Framework:** Expo SDK 54 + Expo Router 6 (file-based routing)
- **Platform:** Web (dev via `localhost:8081`) + Mobile (Expo Go via QR)
- **State:** React Context API — 2 contexts:
  - `AuthContext` — session Supabase, user; có error handling để tránh màn trắng
  - `ThemeContext` — `colors`, `isDark`, `setDarkMode`; persist AsyncStorage
- **Style:** `useMemo(() => createStyles(colors), [colors])` pattern — dynamic StyleSheet theo theme
- **Navigation:** Tab bar (Home / Rules / Alerts / Settings) + Stack cho màn chi tiết
- **Dialog:** `lib/dialog.ts` — `alertMessage()` / `confirmAsync()` — web-safe (không dùng `Alert` native)

### 2b. Database (Supabase Postgres)
| Bảng | Mục đích |
|------|----------|
| `rules` | Rule theo dõi của user |
| `notifications` | Thông báo do AI sinh ra |
| `auth.users` | Supabase built-in auth |

**Schema rules:** `id, user_id, title, description, keyword, category, sources, frequency, condition, is_active, created_at`

**Schema notifications:** `id, rule_id, title, content, ai_summary, details, source, category, sentiment, is_important, is_read, created_at`

Migration file: `supabase/migrations/0001_detailed_rules.sql` (đã chạy thủ công trong Supabase Dashboard)

### 2c. AI Layer — 2 phương thức song song
| | Local (Ollama) | Cloud (Edge Function) |
|---|---|---|
| File | `lib/claude.ts` | `supabase/functions/*/index.ts` |
| Model | `qwen2.5:3b-instruct` | `claude-haiku-4-5-20251001` |
| VRAM cần | ~1.9 GB (RTX 3050 ok) | Không cần GPU |
| Hoạt động trên | Web/PC (localhost:11434) | Cả web lẫn điện thoại |
| Trạng thái | **Đang dùng trong app** | Viết xong, chưa deploy, chưa wired |

> **⚠️ Vấn đề tồn tại:** `lib/claude.ts` gọi `localhost:11434` — không chạy trên điện thoại thật. Edge Functions là con đường cần đi để AI hoạt động trên mobile.

### 2d. Auth
- Supabase Email/Password auth
- Session persist qua AsyncStorage 2.2.0 (khóa cứng phiên bản để tương thích Expo Go 54)
- Auto-redirect: chưa đăng nhập → `/login`
- Error messages dịch sang tiếng Việt trong `login.tsx`

---

## 3. Cấu trúc thư mục

```
ai-notifier-new/
├── app/                        # Expo Router screens
│   ├── _layout.tsx             # Root layout: AuthProvider + AppThemeProvider + Stack
│   ├── (tabs)/                 # Tab navigator
│   │   ├── _layout.tsx         # Tab bar config — động theo ThemeContext
│   │   ├── index.tsx           # Home — stats, active rules, AI Insight, header icons
│   │   ├── rules.tsx           # Danh sách rules + bottom-sheet tạo mới
│   │   ├── notifications.tsx   # Danh sách thông báo + search + filter
│   │   └── settings.tsx        # Settings + theme toggle
│   ├── rule-detail.tsx         # Chi tiết rule + edit + chạy AI monitor
│   ├── notification-detail.tsx # Chi tiết thông báo
│   ├── create-rule.tsx         # AI chat (Ollama) để tạo rule — multi-turn
│   ├── manual-rule.tsx         # Tạo rule thủ công (form)
│   ├── login.tsx               # Đăng nhập + error messages tiếng Việt
│   ├── register.tsx            # Đăng ký + handle confirm email flow
│   └── profile.tsx             # Hồ sơ tài khoản + đổi mật khẩu
│
├── components/
│   ├── StatCard.tsx            # Card số liệu (Rules/Thông báo/Active)
│   ├── FilterTabs.tsx          # Tab filter (Tất cả/Chưa đọc/Quan trọng)
│   ├── SettingRow.tsx          # Hàng setting với Switch hoặc nút
│   ├── SuggestionChip.tsx      # Chip gợi ý trong create-rule
│   ├── Card.tsx                # Container card chung
│   ├── PrimaryButton.tsx       # Nút primary
│   └── IconBadge.tsx           # Badge icon theo category
│
├── contexts/
│   ├── AuthContext.tsx          # Session management + error handling
│   └── ThemeContext.tsx         # Dark/light mode global + persist
│
├── lib/
│   ├── supabase.ts             # Supabase client (⚠️ credentials hardcoded — cần .env)
│   ├── claude.ts               # Ollama client: chatRule() + generateMockNotification()
│   ├── theme.ts                # DARK_COLORS, LIGHT_COLORS, AppColors, SPACING, RADIUS
│   ├── ruleOptions.ts          # CATEGORIES, FREQUENCIES, SENTIMENTS constants
│   └── dialog.ts               # alertMessage(), confirmAsync() — web-safe Alert
│
├── types/
│   ├── Rule.ts / Notification.ts / ChatMessage.ts
│
├── supabase/
│   ├── functions/
│   │   ├── generate-rule/index.ts   # Edge fn: message → rule JSON via Claude (chưa deploy)
│   │   └── run-monitor/index.ts     # Edge fn: ruleId → notification via Claude (chưa deploy)
│   └── migrations/
│       └── 0001_detailed_rules.sql
│
└── app.json                    # web.output: "single" — BẮT BUỘC (không đổi sang "static")
```

---

## 4. Chức năng hiện có

### Hoàn thiện
| Chức năng | File chính | Trạng thái |
|-----------|-----------|------------|
| Đăng nhập / Đăng ký | `login.tsx`, `register.tsx` | ✅ Hoạt động cả web + mobile |
| Lỗi auth dịch tiếng Việt | `login.tsx:translateAuthError` | ✅ |
| Hồ sơ + đổi mật khẩu | `profile.tsx` | ✅ |
| Xem danh sách rules | `(tabs)/rules.tsx` | ✅ Real DB |
| Bottom-sheet tạo rule mới | `rules.tsx` + `index.tsx` | ✅ 2 option: Thủ công / AI |
| Xem danh sách thông báo | `(tabs)/notifications.tsx` | ✅ Real DB + filter + search |
| Home dashboard | `(tabs)/index.tsx` | ✅ Stats + icon user + icon chuông |
| Chi tiết thông báo | `notification-detail.tsx` | ✅ Auto mark-as-read |
| Chi tiết rule + edit | `rule-detail.tsx` | ✅ Full CRUD |
| Tạo rule thủ công | `manual-rule.tsx` | ✅ Form |
| Dark/light mode | `ThemeContext.tsx` + `settings.tsx` | ✅ Real-time + persist |
| Tab bar theo theme | `(tabs)/_layout.tsx` | ✅ Màu động |

### Hoạt động nhưng giới hạn (Ollama local — chỉ web/PC)
| Chức năng | Ghi chú |
|-----------|---------|
| AI chat tạo rule | `create-rule.tsx` → `lib/claude.ts` → `localhost:11434` |
| Chạy thử giám sát | `rule-detail.tsx` → `lib/claude.ts` → `localhost:11434` |

### Chưa làm / chưa kết nối
| Item | Trạng thái |
|------|-----------|
| Edge Function `generate-rule` | Viết xong, **chưa deploy**, app chưa gọi |
| Edge Function `run-monitor` | Viết xong, **chưa deploy**, app chưa gọi |
| Supabase RLS | Chưa có — bất kỳ ai có anon key đọc được toàn bộ data |
| Push notifications thật | Chưa làm (chỉ có in-app) |
| Auto-scheduling rules | Chưa làm (phải bấm tay "Chạy thử") |

---

## 5. Technical Debt cần xử lý

### Nghiêm trọng
1. **⚠️ Không có RLS** — `rules` và `notifications` không có Row Level Security. Bất kỳ ai có anon key đều đọc/ghi được dữ liệu của người khác.

2. **⚠️ Supabase credentials hardcoded** — `lib/supabase.ts` có `supabaseUrl` và `supabaseAnonKey` trực tiếp trong code. Nên dùng `.env` với `EXPO_PUBLIC_*`.

3. **⚠️ AI không chạy được trên điện thoại** — `lib/claude.ts` gọi `localhost:11434` (Ollama). Điện thoại thật không truy cập được localhost của máy tính.

### Nhỏ hơn
4. **Dead components** — `NotificationCard`, `RuleCard`, `AIInsightBox`, `ChatBubble`, `ChatInput`, `StatsCard` tồn tại nhưng không dùng.
5. **`constants/` folder** — legacy, đã thay bằng `lib/theme.ts`, có thể xóa.
6. **Modal tạo rule trùng** — JSX của bottom-sheet tồn tại ở cả `index.tsx` và `rules.tsx`. Nên tách thành `components/CreateRuleSheet.tsx`.

---

## 6. Kế hoạch phát triển tiếp theo

### Phase 2A — AI hoạt động end-to-end (ưu tiên cao nhất)

Mục tiêu: AI tạo rule + sinh notification chạy được trên **cả web lẫn điện thoại** thông qua Edge Functions.

**Bước chuẩn bị (manual — không code):**
1. Tạo tài khoản Anthropic → lấy API Key (`console.anthropic.com`)
2. Cài Supabase CLI: `npm install -g supabase`
3. Link project: `supabase link --project-ref idtibfiyfywcugdvlqal`
4. Set secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`

**Task 2A.1 — Deploy Edge Function `generate-rule`:**
- Cập nhật `supabase/functions/generate-rule/index.ts` — nâng lên multi-turn chat (hiện chỉ single-turn)
- Deploy: `supabase functions deploy generate-rule`
- Cập nhật `app/create-rule.tsx` — thay `chatRule()` (Ollama) bằng `supabase.functions.invoke("generate-rule")`

**Task 2A.2 — Deploy Edge Function `run-monitor`:**
- Fix `supabase/functions/run-monitor/index.ts` — insert đủ 8 fields (hiện chỉ insert 4)
- Deploy: `supabase functions deploy run-monitor`
- Cập nhật `app/rule-detail.tsx` — thay `generateMockNotification()` bằng `supabase.functions.invoke("run-monitor")`

**Test end-to-end:**
1. Tạo rule bằng AI (chat) → rule xuất hiện trong DB
2. Vào rule-detail → bấm "Chạy thử giám sát" → notification xuất hiện
3. Tab Notifications → thấy notification mới với `ai_summary` và `is_important`
4. Kiểm tra trên cả web lẫn điện thoại

---

### Phase 2B — Bảo mật & Ổn định

1. **Setup Supabase RLS:**
```sql
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_rules" ON rules USING (auth.uid() = user_id);
CREATE POLICY "user_notifications" ON notifications
  USING (rule_id IN (SELECT id FROM rules WHERE user_id = auth.uid()));
```

2. **Move credentials ra `.env`:**
```
EXPO_PUBLIC_SUPABASE_URL=https://...
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

### Phase 3 — Auto-scheduling

Tự động chạy rules theo lịch mà không cần user bấm tay:
- **Supabase pg_cron** — Postgres extension, gọi Edge Function theo cron schedule
- Logic: mỗi `frequency` (realtime/hourly/daily/weekly), fetch rules active, gọi `run-monitor` cho mỗi rule
- Cần Edge Function mới `run-all-monitors` để loop qua tất cả rules active

---

### Phase 4 — UX Improvements
| Item | Mô tả |
|------|-------|
| Push notifications | Expo Notifications + FCM (Android) / APNs (iOS) |
| Notification badge trên tab | Đếm số unread chưa đọc hiện trên icon tab |
| Tách `CreateRuleSheet` component | Dùng chung cho Home + Rules, tránh trùng JSX |
| Xóa dead components | Dọn `constants/`, `data/`, unused components |
| Swipe to delete | Gesture trong notifications list |
